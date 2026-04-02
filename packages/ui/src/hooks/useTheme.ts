import { useState, useEffect, useCallback } from 'react';

// ─── Theme Types ────────────────────────────────────────────────────

export type ThemeMode = 'system' | 'dark' | 'light';

export interface ThemeColors {
  /** Main background */
  bg: string;
  /** Secondary / panel background */
  bgPanel: string;
  /** Tertiary / raised surface */
  bgRaised: string;
  /** Hover state background */
  bgHover: string;
  /** Primary text */
  text: string;
  /** Secondary text */
  textSecondary: string;
  /** Muted text */
  textMuted: string;
  /** Very dim text */
  textDim: string;
  /** Border color */
  border: string;
  /** Lighter border */
  borderLight: string;
  /** Divider color */
  divider: string;
  /** Accent / primary action */
  accent: string;
  /** Danger / error */
  danger: string;
  /** Toggle off background */
  toggleOff: string;
  /** Select / input background */
  inputBg: string;
  /** Shadow color */
  shadow: string;
}

// ─── Color Palettes ─────────────────────────────────────────────────

const DARK_COLORS: ThemeColors = {
  bg: '#1a1a2e',
  bgPanel: '#1a1a2e',
  bgRaised: '#22223a',
  bgHover: '#2a2a4e',
  text: '#e0e0e0',
  textSecondary: '#ccc',
  textMuted: '#999',
  textDim: '#666',
  border: '#444',
  borderLight: '#555',
  divider: '#333',
  accent: '#4a90e8',
  danger: '#e8534a',
  toggleOff: '#444',
  inputBg: '#1a1a2e',
  shadow: 'rgba(0,0,0,0.5)',
};

const LIGHT_COLORS: ThemeColors = {
  bg: '#f5f5f8',
  bgPanel: '#ffffff',
  bgRaised: '#eeeef2',
  bgHover: '#e8e8f0',
  text: '#1a1a2e',
  textSecondary: '#333',
  textMuted: '#666',
  textDim: '#999',
  border: '#d0d0d8',
  borderLight: '#c0c0cc',
  divider: '#ddd',
  accent: '#3a7bd5',
  danger: '#d9453c',
  toggleOff: '#bbb',
  inputBg: '#ffffff',
  shadow: 'rgba(0,0,0,0.12)',
};

// ─── Storage ────────────────────────────────────────────────────────

const STORAGE_KEY = 'omnigraph-theme';

function loadThemeMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  } catch { /* ignore */ }
  return 'dark';
}

function saveThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* ignore */ }
}

// ─── Resolve system preference ──────────────────────────────────────

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveColors(mode: ThemeMode): ThemeColors {
  if (mode === 'light') return LIGHT_COLORS;
  if (mode === 'dark') return DARK_COLORS;
  return getSystemPrefersDark() ? DARK_COLORS : LIGHT_COLORS;
}

function resolvedIsDark(mode: ThemeMode): boolean {
  if (mode === 'light') return false;
  if (mode === 'dark') return true;
  return getSystemPrefersDark();
}

// ─── Apply CSS custom properties ────────────────────────────────────

function applyThemeToDom(colors: ThemeColors): void {
  const root = document.documentElement;
  root.style.setProperty('--bg', colors.bg);
  root.style.setProperty('--bg-panel', colors.bgPanel);
  root.style.setProperty('--bg-raised', colors.bgRaised);
  root.style.setProperty('--bg-hover', colors.bgHover);
  root.style.setProperty('--text', colors.text);
  root.style.setProperty('--text-secondary', colors.textSecondary);
  root.style.setProperty('--text-muted', colors.textMuted);
  root.style.setProperty('--text-dim', colors.textDim);
  root.style.setProperty('--border', colors.border);
  root.style.setProperty('--border-light', colors.borderLight);
  root.style.setProperty('--divider', colors.divider);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--danger', colors.danger);
  root.style.setProperty('--toggle-off', colors.toggleOff);
  root.style.setProperty('--input-bg', colors.inputBg);
  root.style.setProperty('--shadow', colors.shadow);

  // Also update body background + color for non-React areas
  document.body.style.background = colors.bg;
  document.body.style.color = colors.text;
}

// ─── Hook ───────────────────────────────────────────────────────────

export interface UseThemeReturn {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

export function useTheme(): UseThemeReturn {
  const [mode, setModeState] = useState<ThemeMode>(loadThemeMode);
  const [colors, setColors] = useState<ThemeColors>(() => resolveColors(loadThemeMode()));
  const [isDark, setIsDark] = useState(() => resolvedIsDark(loadThemeMode()));

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    saveThemeMode(newMode);
    const newColors = resolveColors(newMode);
    setColors(newColors);
    setIsDark(resolvedIsDark(newMode));
    applyThemeToDom(newColors);
  }, []);

  // Apply on mount
  useEffect(() => {
    applyThemeToDom(colors);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for system preference changes (only matters when mode === 'system')
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const newColors = resolveColors('system');
      setColors(newColors);
      setIsDark(resolvedIsDark('system'));
      applyThemeToDom(newColors);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  return { mode, colors, isDark, setMode };
}
