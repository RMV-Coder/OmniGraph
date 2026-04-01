import { useState, useCallback, useEffect } from 'react';

// ─── Settings Schema ─────────────────────────────────────────────────

export interface EdgeLabelSettings {
  showImportLabels: boolean;
  showLinksToLabels: boolean;
  showEmbedsLabels: boolean;
  showHttpLabels: boolean;
  showQueriesLabels: boolean;
  showFkLabels: boolean;
  labelColor: string;
  labelFontSize: number;
}

export interface GraphSettings {
  autoCompact: boolean;
  animateTransitions: boolean;
  animateEdges: boolean;
  minimapVisible: boolean;
}

export interface SearchSettings {
  defaultFilterMode: 'hide' | 'dim';
  defaultDepth: number;
}

export interface AppSettings {
  edgeLabels: EdgeLabelSettings;
  graph: GraphSettings;
  search: SearchSettings;
}

// ─── Defaults ────────────────────────────────────────────────────────

export const DEFAULT_EDGE_LABELS: EdgeLabelSettings = {
  showImportLabels: false,
  showLinksToLabels: false,
  showEmbedsLabels: false,
  showHttpLabels: true,
  showQueriesLabels: true,
  showFkLabels: true,
  labelColor: '#888888',
  labelFontSize: 10,
};

export const DEFAULT_GRAPH: GraphSettings = {
  autoCompact: false,
  animateTransitions: true,
  animateEdges: true,
  minimapVisible: true,
};

export const DEFAULT_SEARCH: SearchSettings = {
  defaultFilterMode: 'hide',
  defaultDepth: 2,
};

export const DEFAULT_SETTINGS: AppSettings = {
  edgeLabels: { ...DEFAULT_EDGE_LABELS },
  graph: { ...DEFAULT_GRAPH },
  search: { ...DEFAULT_SEARCH },
};

// ─── LocalStorage Key ────────────────────────────────────────────────

const STORAGE_KEY = 'omnigraph-settings';

function loadFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    // Deep merge with defaults to handle added fields across versions
    return {
      edgeLabels: { ...DEFAULT_EDGE_LABELS, ...parsed.edgeLabels },
      graph: { ...DEFAULT_GRAPH, ...parsed.graph },
      search: { ...DEFAULT_SEARCH, ...parsed.search },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveToStorage(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Silently fail if storage is unavailable
  }
}

// ─── Hook ────────────────────────────────────────────────────────────

export interface UseSettingsReturn {
  settings: AppSettings;
  updateEdgeLabels: (patch: Partial<EdgeLabelSettings>) => void;
  updateGraph: (patch: Partial<GraphSettings>) => void;
  updateSearch: (patch: Partial<SearchSettings>) => void;
  resetEdgeLabels: () => void;
  resetGraph: () => void;
  resetSearch: () => void;
  resetAll: () => void;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(loadFromStorage);

  // Persist on every change
  useEffect(() => {
    saveToStorage(settings);
  }, [settings]);

  const updateEdgeLabels = useCallback((patch: Partial<EdgeLabelSettings>) => {
    setSettings(prev => ({
      ...prev,
      edgeLabels: { ...prev.edgeLabels, ...patch },
    }));
  }, []);

  const updateGraph = useCallback((patch: Partial<GraphSettings>) => {
    setSettings(prev => ({
      ...prev,
      graph: { ...prev.graph, ...patch },
    }));
  }, []);

  const updateSearch = useCallback((patch: Partial<SearchSettings>) => {
    setSettings(prev => ({
      ...prev,
      search: { ...prev.search, ...patch },
    }));
  }, []);

  const resetEdgeLabels = useCallback(() => {
    setSettings(prev => ({ ...prev, edgeLabels: { ...DEFAULT_EDGE_LABELS } }));
  }, []);

  const resetGraph = useCallback(() => {
    setSettings(prev => ({ ...prev, graph: { ...DEFAULT_GRAPH } }));
  }, []);

  const resetSearch = useCallback(() => {
    setSettings(prev => ({ ...prev, search: { ...DEFAULT_SEARCH } }));
  }, []);

  const resetAll = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS, edgeLabels: { ...DEFAULT_EDGE_LABELS }, graph: { ...DEFAULT_GRAPH }, search: { ...DEFAULT_SEARCH } });
  }, []);

  return {
    settings,
    updateEdgeLabels,
    updateGraph,
    updateSearch,
    resetEdgeLabels,
    resetGraph,
    resetSearch,
    resetAll,
  };
}
