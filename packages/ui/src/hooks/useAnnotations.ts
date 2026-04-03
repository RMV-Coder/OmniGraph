import { useState, useCallback, useEffect } from 'react';

/**
 * Node Annotations / Notes (F62).
 *
 * Attach sticky notes to graph nodes that persist across sessions.
 * Stored in localStorage keyed by node ID.
 */

export interface Annotation {
  nodeId: string;
  text: string;
  updatedAt: number;
  color?: string;
}

const STORAGE_KEY = 'omnigraph-annotations';

function loadAnnotations(): Map<string, Annotation> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const arr: Annotation[] = JSON.parse(raw);
    return new Map(arr.map(a => [a.nodeId, a]));
  } catch { return new Map(); }
}

function saveAnnotations(annotations: Map<string, Annotation>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(annotations.values())));
  } catch { /* ignore */ }
}

export interface UseAnnotationsReturn {
  annotations: Map<string, Annotation>;
  getAnnotation: (nodeId: string) => Annotation | undefined;
  setAnnotation: (nodeId: string, text: string, color?: string) => void;
  removeAnnotation: (nodeId: string) => void;
  annotatedNodeIds: Set<string>;
  exportAnnotations: () => string;
  importAnnotations: (json: string) => number;
}

export function useAnnotations(): UseAnnotationsReturn {
  const [annotations, setAnnotations] = useState<Map<string, Annotation>>(loadAnnotations);

  useEffect(() => {
    saveAnnotations(annotations);
  }, [annotations]);

  const getAnnotation = useCallback((nodeId: string) => {
    return annotations.get(nodeId);
  }, [annotations]);

  const setAnnotation = useCallback((nodeId: string, text: string, color?: string) => {
    setAnnotations(prev => {
      const next = new Map(prev);
      if (!text.trim()) {
        next.delete(nodeId);
      } else {
        next.set(nodeId, { nodeId, text, updatedAt: Date.now(), color });
      }
      return next;
    });
  }, []);

  const removeAnnotation = useCallback((nodeId: string) => {
    setAnnotations(prev => {
      const next = new Map(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const annotatedNodeIds = new Set(annotations.keys());

  const exportAnnotations = useCallback(() => {
    return JSON.stringify(Array.from(annotations.values()), null, 2);
  }, [annotations]);

  const importAnnotations = useCallback((json: string): number => {
    try {
      const imported: Annotation[] = JSON.parse(json);
      if (!Array.isArray(imported)) return 0;
      setAnnotations(prev => {
        const next = new Map(prev);
        for (const a of imported) {
          if (a.nodeId && a.text) {
            next.set(a.nodeId, { ...a, updatedAt: a.updatedAt || Date.now() });
          }
        }
        return next;
      });
      return imported.length;
    } catch { return 0; }
  }, []);

  return {
    annotations, getAnnotation, setAnnotation, removeAnnotation,
    annotatedNodeIds, exportAnnotations, importAnnotations,
  };
}
