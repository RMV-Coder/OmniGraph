import React, { useState, useRef, useEffect } from 'react';
import type { AppSettings, EdgeLabelSettings, GraphSettings, SearchSettings } from '../../hooks/useSettings';
import type { ThemeMode } from '../../hooks/useTheme';

// ─── Shared Styles ───────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  marginBottom: 16,
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontWeight: 700,
};

const resetBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--border)',
  color: 'var(--text-muted)',
  fontSize: 9,
  padding: '2px 8px',
  borderRadius: 3,
  cursor: 'pointer',
  transition: 'all 0.15s',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '5px 0',
};

const labelTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-secondary)',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--divider)',
  margin: '12px 0',
};

const selectStyle: React.CSSProperties = {
  background: 'var(--input-bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 11,
  cursor: 'pointer',
  outline: 'none',
};

// ─── Toggle Switch ───────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 34,
        height: 18,
        borderRadius: 9,
        border: 'none',
        background: checked ? 'var(--accent)' : 'var(--toggle-off)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
        }}
      />
    </button>
  );
}

// ─── Color Picker ────────────────────────────────────────────────────

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          border: '2px solid var(--border-light)',
          background: color,
          cursor: 'pointer',
          padding: 0,
          transition: 'border-color 0.15s',
        }}
        title={color}
      />
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{color}</span>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 28,
            right: 0,
            zIndex: 100,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 8,
            boxShadow: '0 4px 16px var(--shadow)',
          }}
        >
          <input
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: 120,
              height: 80,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          />
          <input
            type="text"
            value={color}
            onChange={(e) => {
              if (/^#[0-9a-f]{0,6}$/i.test(e.target.value)) {
                onChange(e.target.value);
              }
            }}
            style={{
              ...selectStyle,
              width: '100%',
              marginTop: 4,
              fontFamily: 'monospace',
              fontSize: 11,
              textAlign: 'center',
            }}
            maxLength={7}
          />
        </div>
      )}
    </div>
  );
}

// ─── Number Input ────────────────────────────────────────────────────

function NumberInput({
  value, onChange, min, max, suffix,
}: {
  value: number; onChange: (v: number) => void; min: number; max: number; suffix?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 60, accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 600, minWidth: 24, textAlign: 'right' }}>
        {value}{suffix ?? ''}
      </span>
    </div>
  );
}

// ─── Section Components ──────────────────────────────────────────────

function SectionHeader({ title, onReset }: { title: string; onReset: () => void }) {
  return (
    <div style={sectionHeaderStyle}>
      <span style={sectionTitleStyle}>{title}</span>
      <button
        onClick={onReset}
        style={resetBtnStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--danger)';
          e.currentTarget.style.color = 'var(--danger)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '';
          e.currentTarget.style.color = '';
        }}
      >
        Reset
      </button>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={rowStyle}>
      <span style={labelTextStyle}>{label}</span>
      {children}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────

interface Props {
  settings: AppSettings;
  onUpdateEdgeLabels: (patch: Partial<EdgeLabelSettings>) => void;
  onUpdateGraph: (patch: Partial<GraphSettings>) => void;
  onUpdateSearch: (patch: Partial<SearchSettings>) => void;
  onResetEdgeLabels: () => void;
  onResetGraph: () => void;
  onResetSearch: () => void;
  onResetAll: () => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
}

export default function SettingsPanel({
  settings, onUpdateEdgeLabels, onUpdateGraph, onUpdateSearch,
  onResetEdgeLabels, onResetGraph, onResetSearch, onResetAll,
  themeMode, onThemeChange,
}: Props) {
  const { edgeLabels, graph, search } = settings;

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text)', margin: 0, fontWeight: 700 }}>Settings</h3>
        <button
          onClick={onResetAll}
          style={{
            ...resetBtnStyle,
            fontSize: 10,
            padding: '3px 10px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#e8534a';
            e.currentTarget.style.color = '#e8534a';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#444';
            e.currentTarget.style.color = '#888';
          }}
        >
          Reset All
        </button>
      </div>

      {/* ── Theme ─────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <span style={sectionTitleStyle}>Theme</span>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {(['system', 'dark', 'light'] as ThemeMode[]).map((m) => (
            <button
              key={m}
              onClick={() => onThemeChange(m)}
              style={{
                flex: 1,
                background: themeMode === m ? 'var(--accent)' : 'var(--input-bg)',
                color: themeMode === m ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${themeMode === m ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 4,
                padding: '5px 0',
                fontSize: 11,
                fontWeight: themeMode === m ? 700 : 400,
                cursor: 'pointer',
                transition: 'all 0.15s',
                textTransform: 'capitalize',
              }}
            >
              {m === 'system' ? '\u{1F5A5} Auto' : m === 'dark' ? '\u{1F319} Dark' : '\u{2600} Light'}
            </button>
          ))}
        </div>
      </div>

      <div style={dividerStyle} />

      {/* ── Connection Labels ──────────────────────────────────── */}
      <div style={sectionStyle}>
        <SectionHeader title="Connection Labels" onReset={onResetEdgeLabels} />

        <SettingRow label="Show &quot;imports&quot;">
          <Toggle checked={edgeLabels.showImportLabels} onChange={(v) => onUpdateEdgeLabels({ showImportLabels: v })} />
        </SettingRow>

        <SettingRow label="Show &quot;links to&quot;">
          <Toggle checked={edgeLabels.showLinksToLabels} onChange={(v) => onUpdateEdgeLabels({ showLinksToLabels: v })} />
        </SettingRow>

        <SettingRow label="Show &quot;embeds&quot;">
          <Toggle checked={edgeLabels.showEmbedsLabels} onChange={(v) => onUpdateEdgeLabels({ showEmbedsLabels: v })} />
        </SettingRow>

        <SettingRow label="Show HTTP methods">
          <Toggle checked={edgeLabels.showHttpLabels} onChange={(v) => onUpdateEdgeLabels({ showHttpLabels: v })} />
        </SettingRow>

        <SettingRow label="Show &quot;queries&quot;">
          <Toggle checked={edgeLabels.showQueriesLabels} onChange={(v) => onUpdateEdgeLabels({ showQueriesLabels: v })} />
        </SettingRow>

        <SettingRow label="Show foreign keys">
          <Toggle checked={edgeLabels.showFkLabels} onChange={(v) => onUpdateEdgeLabels({ showFkLabels: v })} />
        </SettingRow>

        <div style={{ height: 4 }} />

        <SettingRow label="Label color">
          <ColorPicker color={edgeLabels.labelColor} onChange={(c) => onUpdateEdgeLabels({ labelColor: c })} />
        </SettingRow>

        <SettingRow label="Label font size">
          <NumberInput value={edgeLabels.labelFontSize} onChange={(v) => onUpdateEdgeLabels({ labelFontSize: v })} min={6} max={16} suffix="px" />
        </SettingRow>
      </div>

      <div style={dividerStyle} />

      {/* ── Graph ──────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <SectionHeader title="Graph" onReset={onResetGraph} />

        <SettingRow label="Animate transitions">
          <Toggle checked={graph.animateTransitions} onChange={(v) => onUpdateGraph({ animateTransitions: v })} />
        </SettingRow>

        <SettingRow label="Animate edges">
          <Toggle checked={graph.animateEdges} onChange={(v) => onUpdateGraph({ animateEdges: v })} />
        </SettingRow>

        <SettingRow label="Show minimap">
          <Toggle checked={graph.minimapVisible} onChange={(v) => onUpdateGraph({ minimapVisible: v })} />
        </SettingRow>
      </div>

      <div style={dividerStyle} />

      {/* ── Search & Filter ────────────────────────────────────── */}
      <div style={sectionStyle}>
        <SectionHeader title="Search & Filter" onReset={onResetSearch} />

        <SettingRow label="Default filter mode">
          <select
            value={search.defaultFilterMode}
            onChange={(e) => onUpdateSearch({ defaultFilterMode: e.target.value as 'hide' | 'dim' })}
            style={selectStyle}
          >
            <option value="hide">Hide</option>
            <option value="dim">Dim</option>
          </select>
        </SettingRow>

        <SettingRow label="Default depth">
          <NumberInput value={search.defaultDepth} onChange={(v) => onUpdateSearch({ defaultDepth: v })} min={0} max={5} />
        </SettingRow>
      </div>
    </div>
  );
}
