import { useEffect, useCallback } from 'react';

/**
 * Keyboard shortcut definitions for OmniGraph (F63).
 *
 * Shortcuts:
 *   Ctrl+K / Cmd+K  — Focus search input
 *   1-6             — Switch layout preset (directory, hierarchical, columns, force, grid, mindmap)
 *   C               — Compact nodes
 *   Escape          — Close inspector / clear search
 *   ?               — Toggle keyboard shortcut help
 */

export interface ShortcutActions {
  onFocusSearch: () => void;
  onLayoutChange: (preset: string) => void;
  onCompact: () => void;
  onCloseInspector: () => void;
  onToggleHelp: () => void;
}

const LAYOUT_MAP: Record<string, string> = {
  '1': 'directory',
  '2': 'hierarchical',
  '3': 'columns',
  '4': 'force',
  '5': 'grid',
  '6': 'mindmap',
};

export function useKeyboardShortcuts(actions: ShortcutActions): void {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Skip if user is typing in an input/textarea/select
    const target = e.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      // Only handle Escape in inputs
      if (e.key === 'Escape') {
        (target as HTMLInputElement).blur();
        actions.onCloseInspector();
        e.preventDefault();
      }
      return;
    }

    // Ctrl+K / Cmd+K — Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      actions.onFocusSearch();
      return;
    }

    // Number keys 1-6 — Layout presets
    if (!e.ctrlKey && !e.metaKey && !e.altKey && LAYOUT_MAP[e.key]) {
      e.preventDefault();
      actions.onLayoutChange(LAYOUT_MAP[e.key]);
      return;
    }

    // C — Compact
    if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      actions.onCompact();
      return;
    }

    // Escape — Close inspector
    if (e.key === 'Escape') {
      actions.onCloseInspector();
      return;
    }

    // ? — Toggle help
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      actions.onToggleHelp();
      return;
    }
  }, [actions]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/** Shortcut definitions for the help overlay */
export const SHORTCUT_LIST = [
  { keys: 'Ctrl+K', description: 'Focus search' },
  { keys: '1-6', description: 'Switch layout preset' },
  { keys: 'C', description: 'Compact nodes' },
  { keys: 'Esc', description: 'Close inspector / deselect' },
  { keys: '?', description: 'Toggle this help' },
];
