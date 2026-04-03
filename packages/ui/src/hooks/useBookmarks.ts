import { useState, useCallback, useEffect } from 'react';

/**
 * Bookmarks / Saved Views (F61).
 *
 * Saves filter + layout + search state as named views.
 * Persisted in localStorage. JSON export/import supported.
 */

export interface Bookmark {
  id: string;
  name: string;
  createdAt: number;
  /** Saved state */
  layoutPreset: string;
  searchQuery: string;
  searchFilterMode: string;
  searchDepth: number;
  activeTypes: string[];
  /** Viewport position */
  viewport?: { x: number; y: number; zoom: number };
}

const STORAGE_KEY = 'omnigraph-bookmarks';

function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function saveBookmarks(bookmarks: Bookmark[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch { /* ignore */ }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export interface UseBookmarksReturn {
  bookmarks: Bookmark[];
  addBookmark: (bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => void;
  removeBookmark: (id: string) => void;
  renameBookmark: (id: string, name: string) => void;
  exportBookmarks: () => string;
  importBookmarks: (json: string) => number;
}

export function useBookmarks(): UseBookmarksReturn {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks);

  useEffect(() => {
    saveBookmarks(bookmarks);
  }, [bookmarks]);

  const addBookmark = useCallback((bm: Omit<Bookmark, 'id' | 'createdAt'>) => {
    setBookmarks(prev => [
      ...prev,
      { ...bm, id: generateId(), createdAt: Date.now() },
    ]);
  }, []);

  const removeBookmark = useCallback((id: string) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  }, []);

  const renameBookmark = useCallback((id: string, name: string) => {
    setBookmarks(prev => prev.map(b => b.id === id ? { ...b, name } : b));
  }, []);

  const exportBookmarks = useCallback(() => {
    return JSON.stringify(bookmarks, null, 2);
  }, [bookmarks]);

  const importBookmarks = useCallback((json: string): number => {
    try {
      const imported = JSON.parse(json) as Bookmark[];
      if (!Array.isArray(imported)) return 0;
      const valid = imported.filter(b => b.name && b.layoutPreset);
      // Re-generate IDs to avoid conflicts
      const withNewIds = valid.map(b => ({
        ...b,
        id: generateId(),
        createdAt: b.createdAt || Date.now(),
      }));
      setBookmarks(prev => [...prev, ...withNewIds]);
      return withNewIds.length;
    } catch { return 0; }
  }, []);

  return { bookmarks, addBookmark, removeBookmark, renameBookmark, exportBookmarks, importBookmarks };
}
