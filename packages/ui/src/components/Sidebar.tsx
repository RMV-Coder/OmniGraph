import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { LayoutPreset, MindmapDirection } from '../layout';
import { LAYOUT_PRESETS } from '../layout';
import { NODE_COLORS } from '../layout/shared';
import type { OmniNode, OmniEdge, HttpMethod, ProxyResponse, FlowTrace } from '../types';
import type { SearchFilterMode } from '../App';
import type { AppSettings, EdgeLabelSettings, GraphSettings, SearchSettings } from '../hooks/useSettings';
import CodeViewer from './CodeViewer';
import ApiClientPanel from './sidebar/ApiClientPanel';
import FlowTracerPanel from './sidebar/FlowTracerPanel';
import SettingsPanel from './sidebar/SettingsPanel';
import DatabasePanel from './sidebar/DatabasePanel';
import type { SavedConnection } from '../hooks/useDatabase';
import type { DatabaseSavedConnection, DatabaseSchema, DatabaseTable, DatabaseQueryResult, DatabaseEnvConnection } from '../types';

export type SidebarTab = 'controls' | 'api-client' | 'flow-tracer' | 'database' | 'settings';

const NODE_TYPE_LABELS: Record<string, string> = {
  'nestjs-controller': 'Controller',
  'nestjs-injectable': 'Injectable',
  'nestjs-module': 'Module',
  'typescript-file': 'TypeScript',
  'javascript-file': 'JavaScript',
  'nextjs-api-route': 'Next.js API',
  'nextjs-page': 'Next.js Page',
  'nextjs-layout': 'Next.js Layout',
  'markdown-file': 'Markdown',
  'markdown-moc': 'Map of Content',
  'markdown-daily': 'Daily Note',
  'markdown-readme': 'README',
  'python-file': 'Python',
  'python-fastapi-route': 'FastAPI Route',
  'python-django-view': 'Django View',
  'python-django-model': 'Django Model',
  'php-file': 'PHP',
  'php-laravel-controller': 'Laravel Controller',
  'php-laravel-model': 'Laravel Model',
  'php-laravel-middleware': 'Laravel Middleware',
  'php-laravel-route': 'Laravel Route',
  'db-table': 'DB Table',
  'db-collection': 'DB Collection',
  'db-view': 'DB View',
  'method-node': 'Method',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--input-bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-dim)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const chipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid transparent',
  userSelect: 'none',
  transition: 'opacity 0.15s',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--divider)',
  margin: '4px 0',
};

const exportBtnStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--input-bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '5px 0',
  fontSize: 11,
  cursor: 'pointer',
  transition: 'background 0.15s',
};

interface Props {
  // Tab control
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  // Layout
  layoutPreset: LayoutPreset;
  onLayoutChange: (preset: LayoutPreset) => void;
  mindmapDirection: MindmapDirection;
  onDirectionChange: (dir: MindmapDirection) => void;
  // Search & filter
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchFilterMode: SearchFilterMode;
  onSearchFilterModeChange: (mode: SearchFilterMode) => void;
  searchDepth: number;
  onSearchDepthChange: (depth: number) => void;
  activeTypes: Set<string>;
  onTypeToggle: (type: string) => void;
  availableTypes: string[];
  matchCount: number;
  totalCount: number;
  // Compact
  onCompact: () => void;
  isCompacting: boolean;
  // Inspector
  selectedNode: OmniNode | null;
  onCloseInspector: () => void;
  // Export
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  onExportGif: () => void;
  // API Client
  apiBaseUrl: string;
  onApiBaseUrlChange: (url: string) => void;
  apiRequest: { method: HttpMethod; url: string; headers: Record<string, string>; queryParams: Record<string, string>; body: string | null };
  apiResponse: ProxyResponse | null;
  apiLoading: boolean;
  apiError: string | null;
  onApiMethodChange: (method: HttpMethod) => void;
  onApiUrlChange: (url: string) => void;
  onApiSetHeader: (key: string, value: string) => void;
  onApiRemoveHeader: (key: string) => void;
  onApiSetQueryParam: (key: string, value: string) => void;
  onApiRemoveQueryParam: (key: string) => void;
  onApiBodyChange: (body: string | null) => void;
  onApiSend: () => void;
  onApiReset: () => void;
  // Flow Tracer
  flowTrace: FlowTrace | null;
  flowCurrentStepIndex: number;
  onFlowStepForward: () => void;
  onFlowStepBackward: () => void;
  onFlowGoToStep: (index: number) => void;
  onFlowStop: () => void;
  onFlowOpenInApiClient: () => void;
  // Settings
  settings: AppSettings;
  onUpdateEdgeLabels: (patch: Partial<EdgeLabelSettings>) => void;
  onUpdateGraph: (patch: Partial<GraphSettings>) => void;
  onUpdateSearch: (patch: Partial<SearchSettings>) => void;
  onResetEdgeLabels: () => void;
  onResetGraph: () => void;
  onResetSearch: () => void;
  onResetAll: () => void;
  // Database
  dbConnections: SavedConnection[];
  dbActiveConnectionId: string | null;
  dbSchema: DatabaseSchema | null;
  dbSchemaLoading: boolean;
  dbSchemaError: string | null;
  dbQueryResult: DatabaseQueryResult | null;
  dbQueryLoading: boolean;
  dbQueryError: string | null;
  dbEnvConnections: DatabaseEnvConnection[];
  dbEnvLoading: boolean;
  onDbAddConnection: (config: DatabaseSavedConnection) => void;
  onDbUpdateConnection: (id: string, patch: Partial<DatabaseSavedConnection>) => void;
  onDbRemoveConnection: (id: string) => void;
  onDbConnectWithCredentials: (id: string, username: string, password: string) => void;
  onDbConnectFromEnv: (env: DatabaseEnvConnection) => void;
  onDbConnectFromCustomKey: (key: string) => Promise<string | null>;
  onDbDisconnect: (id: string) => void;
  onDbLoadSchema: (id: string) => void;
  onDbExecuteQuery: (query: string, limit?: number) => void;
  onDbClearQuery: () => void;
  onDbSelectTable?: (table: DatabaseTable) => void;
  // Method expansion
  expandedMethodNodes: Set<string>;
  onExpandMethods: (nodeId: string) => void;
  // Theme
  themeMode: import('../hooks/useTheme').ThemeMode;
  onThemeChange: (mode: import('../hooks/useTheme').ThemeMode) => void;
}

// ─── Tab Bar ─────────────────────────────────────────────────────────

function TabBar({
  activeTab,
  onTabChange,
  hasTrace,
}: {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  hasTrace: boolean;
}) {
  const tabs: { key: SidebarTab; label: string; icon: string; show: boolean }[] = [
    { key: 'controls', label: 'Graph', icon: '\u{1F4CA}', show: true },
    { key: 'api-client', label: 'API', icon: '\u{1F4E1}', show: true },
    { key: 'flow-tracer', label: 'Trace', icon: '\u{1F50D}', show: hasTrace },
    { key: 'database', label: 'DB', icon: '\u{1F5C4}', show: true },
    { key: 'settings', label: 'Settings', icon: '\u{2699}', show: true },
  ];

  return (
    <div
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--divider)',
        flexShrink: 0,
      }}
    >
      {tabs
        .filter(t => t.show)
        .map(t => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            style={{
              flex: 1,
              background: activeTab === t.key ? 'var(--bg)' : 'transparent',
              color: activeTab === t.key ? 'var(--text)' : 'var(--text-dim)',
              border: 'none',
              borderBottom: activeTab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              padding: '8px 4px',
              fontSize: 11,
              fontWeight: activeTab === t.key ? 700 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
    </div>
  );
}

// ─── Export Dropdown ─────────────────────────────────────────────────

function ExportDropdown({
  onExportPng,
  onExportSvg,
  onExportJson,
  onExportGif,
}: {
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  onExportGif: () => void;
}) {
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

  const items = [
    { label: 'PNG', desc: 'Static image', onClick: onExportPng },
    { label: 'SVG', desc: 'Vector image', onClick: onExportSvg },
    { label: 'GIF', desc: '3s animation', onClick: onExportGif },
    { label: 'JSON', desc: 'Graph data', onClick: onExportJson },
  ];

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...exportBtnStyle,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        Export
        <span style={{ fontSize: 8, marginTop: 1 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: 4,
            background: '#1a1a2e',
            border: '1px solid #444',
            borderRadius: 4,
            overflow: 'hidden',
            zIndex: 20,
            boxShadow: '0 -4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                background: 'transparent',
                color: '#e0e0e0',
                border: 'none',
                padding: '7px 12px',
                fontSize: 11,
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2a2a4e'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <span style={{ fontWeight: 600 }}>{item.label}</span>
              <span style={{ color: '#666', marginLeft: 8, fontSize: 10 }}>{item.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Controls Panel ──────────────────────────────────────────────────

function ControlsPanel({
  layoutPreset, onLayoutChange, mindmapDirection, onDirectionChange,
  searchQuery, onSearchChange, searchFilterMode, onSearchFilterModeChange,
  searchDepth, onSearchDepthChange,
  activeTypes, onTypeToggle, availableTypes,
  matchCount, totalCount, selectedNode, onCloseInspector,
  onExportPng, onExportSvg, onExportJson, onExportGif,
  onCompact, isCompacting,
  expandedMethodNodes, onExpandMethods,
}: Pick<Props,
  'layoutPreset' | 'onLayoutChange' | 'mindmapDirection' | 'onDirectionChange' |
  'searchQuery' | 'onSearchChange' | 'searchFilterMode' | 'onSearchFilterModeChange' |
  'searchDepth' | 'onSearchDepthChange' |
  'activeTypes' | 'onTypeToggle' | 'availableTypes' |
  'matchCount' | 'totalCount' | 'selectedNode' | 'onCloseInspector' |
  'onExportPng' | 'onExportSvg' | 'onExportJson' | 'onExportGif' |
  'onCompact' | 'isCompacting' |
  'expandedMethodNodes' | 'onExpandMethods'
>) {
  return (
    <>
      <div style={{ padding: '12px 16px 8px' }}>
        {/* Layout selector */}
        <div style={{ marginBottom: 10 }}>
          <p style={labelStyle}>Layout</p>
          <select
            value={layoutPreset}
            onChange={(e) => onLayoutChange(e.target.value as LayoutPreset)}
            style={selectStyle}
          >
            {LAYOUT_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>

        {layoutPreset === 'mindmap' && (
          <div style={{ marginBottom: 10 }}>
            <p style={labelStyle}>Direction</p>
            <select
              value={mindmapDirection}
              onChange={(e) => onDirectionChange(e.target.value as MindmapDirection)}
              style={selectStyle}
            >
              <option value="LR">Left to Right</option>
              <option value="RL">Right to Left</option>
            </select>
          </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: 8 }}>
          <p style={labelStyle}>Search</p>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search nodes..."
              style={{ ...selectStyle, padding: '6px 28px 6px 8px' }}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: '#666', cursor: 'pointer',
                  fontSize: 14, padding: 0, lineHeight: 1,
                }}
              >
                &times;
              </button>
            )}
          </div>
          {searchQuery && (
            <span style={{ fontSize: 10, color: '#666', marginTop: 4, display: 'block' }}>
              {matchCount} of {totalCount} nodes
            </span>
          )}

          {/* Search filter settings */}
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Mode toggle: Hide vs Dim */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: '#666', whiteSpace: 'nowrap' }}>Unmatched:</span>
              <div style={{
                display: 'flex',
                borderRadius: 4,
                overflow: 'hidden',
                border: '1px solid #444',
                flexShrink: 0,
              }}>
                <button
                  onClick={() => onSearchFilterModeChange('hide')}
                  style={{
                    background: searchFilterMode === 'hide' ? '#4a90e8' : '#1a1a2e',
                    color: searchFilterMode === 'hide' ? '#fff' : '#888',
                    border: 'none',
                    padding: '3px 10px',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  Hide
                </button>
                <button
                  onClick={() => onSearchFilterModeChange('dim')}
                  style={{
                    background: searchFilterMode === 'dim' ? '#4a90e8' : '#1a1a2e',
                    color: searchFilterMode === 'dim' ? '#fff' : '#888',
                    border: 'none',
                    borderLeft: '1px solid #444',
                    padding: '3px 10px',
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  Dim
                </button>
              </div>
            </div>

            {/* Connection depth slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: '#666', whiteSpace: 'nowrap' }}>Depth:</span>
              <input
                type="range"
                min={0}
                max={5}
                value={searchDepth}
                onChange={(e) => onSearchDepthChange(Number(e.target.value))}
                style={{
                  flex: 1,
                  height: 4,
                  accentColor: '#4a90e8',
                  cursor: 'pointer',
                }}
              />
              <span style={{
                fontSize: 10,
                color: '#e0e0e0',
                minWidth: 14,
                textAlign: 'right',
                fontWeight: 600,
              }}>
                {searchDepth}
              </span>
            </div>
          </div>
        </div>

        {/* Type filter chips */}
        <div>
          <p style={labelStyle}>Filter</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {availableTypes.map((type) => {
              const active = activeTypes.has(type);
              const color = NODE_COLORS[type] ?? '#888';
              return (
                <div
                  key={type}
                  onClick={() => onTypeToggle(type)}
                  style={{
                    ...chipBase,
                    background: active ? color : 'transparent',
                    color: active ? '#fff' : '#888',
                    border: `1px solid ${active ? color : '#555'}`,
                    opacity: active ? 1 : 0.5,
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', background: color,
                    display: 'inline-block', opacity: active ? 1 : 0.4,
                  }} />
                  {NODE_TYPE_LABELS[type] ?? type}
                </div>
              );
            })}
          </div>
        </div>

        {/* Export + Compact */}
        <div style={{ marginTop: 10 }}>
          <p style={labelStyle}>Actions</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <ExportDropdown
              onExportPng={onExportPng}
              onExportSvg={onExportSvg}
              onExportJson={onExportJson}
              onExportGif={onExportGif}
            />
            <button
              onClick={onCompact}
              disabled={isCompacting}
              style={{
                ...exportBtnStyle,
                background: isCompacting ? '#333' : '#1a1a2e',
                color: isCompacting ? '#555' : '#4a90e8',
                borderColor: isCompacting ? '#333' : '#4a90e8',
                fontWeight: 600,
                cursor: isCompacting ? 'default' : 'pointer',
              }}
              title="Compact visible nodes together"
            >
              Compact
            </button>
          </div>
        </div>
      </div>

      <div style={dividerStyle} />

      {/* Node Inspector */}
      {selectedNode ? (
        <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 14, color: '#fff', margin: 0 }}>{selectedNode.label}</h2>
            <button
              onClick={onCloseInspector}
              style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}
            >
              &times;
            </button>
          </div>
          <div>
            <span style={{
              background: NODE_COLORS[selectedNode.type] ?? '#888', borderRadius: 4,
              padding: '2px 8px', fontSize: 10, color: '#fff', display: 'inline-block',
            }}>
              {NODE_TYPE_LABELS[selectedNode.type] ?? selectedNode.type}
            </span>
          </div>

          {/* DB Node Inspector */}
          {selectedNode.id.startsWith('db://') ? (
            <>
              <div>
                <p style={labelStyle}>Engine</p>
                <p style={{ fontSize: 11, color: '#e0e0e0', margin: 0 }}>
                  {selectedNode.metadata.engine === 'postgresql' ? '\u{1F418} PostgreSQL' : '\u{1F343} MongoDB'}
                </p>
              </div>
              <div>
                <p style={labelStyle}>Database</p>
                <p style={{ fontSize: 11, color: '#e0e0e0', margin: 0 }}>{selectedNode.metadata.database}</p>
              </div>
              {selectedNode.metadata.schema && (
                <div>
                  <p style={labelStyle}>Schema</p>
                  <p style={{ fontSize: 11, color: '#e0e0e0', margin: 0 }}>{selectedNode.metadata.schema}</p>
                </div>
              )}
              {selectedNode.metadata.rowCount && (
                <div>
                  <p style={labelStyle}>Row Count</p>
                  <p style={{ fontSize: 11, color: '#e0e0e0', margin: 0 }}>
                    {Number(selectedNode.metadata.rowCount).toLocaleString()}
                  </p>
                </div>
              )}
              {selectedNode.metadata.columns && (
                <div>
                  <p style={labelStyle}>Columns ({selectedNode.metadata.columnCount})</p>
                  <div style={{
                    fontSize: 10,
                    fontFamily: 'monospace',
                    color: '#aaa',
                    background: '#111125',
                    borderRadius: 4,
                    padding: '6px 8px',
                    maxHeight: 200,
                    overflowY: 'auto',
                  }}>
                    {selectedNode.metadata.columns.split(', ').map((col) => (
                      <div key={col} style={{ padding: '1px 0' }}>{col}</div>
                    ))}
                  </div>
                </div>
              )}
              {selectedNode.metadata.indexCount && Number(selectedNode.metadata.indexCount) > 0 && (
                <div>
                  <p style={labelStyle}>Indexes</p>
                  <p style={{ fontSize: 11, color: '#e0e0e0', margin: 0 }}>{selectedNode.metadata.indexCount}</p>
                </div>
              )}
              {selectedNode.metadata.foreignKeyCount && Number(selectedNode.metadata.foreignKeyCount) > 0 && (
                <div>
                  <p style={labelStyle}>Foreign Keys</p>
                  <p style={{ fontSize: 11, color: '#2dd4bf', margin: 0 }}>{selectedNode.metadata.foreignKeyCount}</p>
                </div>
              )}
              <div>
                <p style={labelStyle}>Node ID</p>
                <p style={{ fontSize: 11, color: '#888', wordBreak: 'break-all', margin: 0 }}>{selectedNode.id}</p>
              </div>
            </>
          ) : (
            /* Code Node Inspector */
            <>
              <div>
                <p style={labelStyle}>File Path</p>
                <p style={{ fontSize: 11, color: '#e0e0e0', wordBreak: 'break-all', margin: 0 }}>
                  {selectedNode.metadata.filePath ?? selectedNode.id}
                </p>
              </div>
              {selectedNode.metadata.route && (
                <div>
                  <p style={labelStyle}>Route</p>
                  <p style={{ fontSize: 11, color: '#e0e0e0', margin: 0 }}>{selectedNode.metadata.route}</p>
                </div>
              )}
              {selectedNode.metadata.language && (
                <div>
                  <p style={labelStyle}>Language</p>
                  <p style={{ fontSize: 11, color: '#e0e0e0', margin: 0 }}>{selectedNode.metadata.language}</p>
                </div>
              )}
              {selectedNode.metadata.framework && (
                <div>
                  <p style={labelStyle}>Framework</p>
                  <p style={{ fontSize: 11, color: '#e0e0e0', margin: 0 }}>{selectedNode.metadata.framework}</p>
                </div>
              )}
              {selectedNode.metadata.namespace && (
                <div>
                  <p style={labelStyle}>Namespace</p>
                  <p style={{ fontSize: 11, color: '#e0e0e0', wordBreak: 'break-all', margin: 0 }}>{selectedNode.metadata.namespace}</p>
                </div>
              )}
              {selectedNode.metadata.classes && (
                <div>
                  <p style={labelStyle}>Classes</p>
                  <p style={{ fontSize: 11, color: '#e0e0e0', margin: 0 }}>{selectedNode.metadata.classes}</p>
                </div>
              )}
              {selectedNode.metadata.functions && (
                <div>
                  <p style={labelStyle}>Functions</p>
                  <p style={{ fontSize: 11, color: '#e0e0e0', margin: 0 }}>{selectedNode.metadata.functions}</p>
                </div>
              )}
              {selectedNode.metadata.methods && (
                <div>
                  <p style={labelStyle}>Methods</p>
                  <p style={{ fontSize: 11, color: '#e0e0e0', margin: 0 }}>{selectedNode.metadata.methods}</p>
                </div>
              )}
              <div>
                <p style={labelStyle}>Node ID</p>
                <p style={{ fontSize: 11, color: '#888', wordBreak: 'break-all', margin: 0 }}>{selectedNode.id}</p>
              </div>
              {/* Method Expansion */}
              {selectedNode.methods && selectedNode.methods.length > 0 && (
                <button
                  onClick={() => onExpandMethods(selectedNode.id)}
                  style={{
                    width: '100%',
                    background: expandedMethodNodes.has(selectedNode.id) ? '#5a5a8a' : '#1a1a2e',
                    color: expandedMethodNodes.has(selectedNode.id) ? '#fff' : '#ccc',
                    border: '1px solid #444',
                    borderRadius: 4,
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: 4,
                    transition: 'all 0.15s',
                  }}
                >
                  {expandedMethodNodes.has(selectedNode.id)
                    ? `Collapse Methods (${selectedNode.methods.length})`
                    : `Expand Methods (${selectedNode.methods.length})`}
                </button>
              )}
              <div style={dividerStyle} />
              <CodeViewer filePath={selectedNode.metadata.filePath ?? selectedNode.id} />
            </>
          )}
        </div>
      ) : (
        <div style={{ padding: '10px 16px' }}>
          <p style={{ fontSize: 11, color: '#555', fontStyle: 'italic', margin: 0 }}>
            Click a node to inspect
          </p>
        </div>
      )}
    </>
  );
}

// ─── Main Sidebar ────────────────────────────────────────────────────

const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 260;
const MAX_WIDTH = 700;
const STORAGE_KEY = 'omnigraph-sidebar-width';

function loadSavedWidth(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const w = Number(saved);
      if (w >= MIN_WIDTH && w <= MAX_WIDTH) return w;
    }
  } catch { /* ignore */ }
  return DEFAULT_WIDTH;
}

export default function Sidebar(props: Props) {
  const {
    activeTab, onTabChange,
    // API Client
    apiBaseUrl, onApiBaseUrlChange,
    apiRequest, apiResponse, apiLoading, apiError,
    onApiMethodChange, onApiUrlChange, onApiSetHeader, onApiRemoveHeader,
    onApiSetQueryParam, onApiRemoveQueryParam, onApiBodyChange, onApiSend, onApiReset,
    // Flow Tracer
    flowTrace, flowCurrentStepIndex,
    onFlowStepForward, onFlowStepBackward, onFlowGoToStep, onFlowStop, onFlowOpenInApiClient,
    // Settings
    settings, onUpdateEdgeLabels, onUpdateGraph, onUpdateSearch,
    onResetEdgeLabels, onResetGraph, onResetSearch, onResetAll,
    // Database
    dbConnections, dbActiveConnectionId, dbSchema, dbSchemaLoading, dbSchemaError,
    dbQueryResult, dbQueryLoading, dbQueryError,
    dbEnvConnections, dbEnvLoading,
    onDbAddConnection, onDbUpdateConnection, onDbRemoveConnection,
    onDbConnectWithCredentials, onDbConnectFromEnv, onDbConnectFromCustomKey, onDbDisconnect, onDbLoadSchema,
    onDbExecuteQuery, onDbClearQuery, onDbSelectTable,
    // Theme
    themeMode, onThemeChange,
  } = props;

  const [sidebarWidth, setSidebarWidth] = useState(loadSavedWidth);
  const widthRef = useRef(sidebarWidth);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Keep ref in sync
  useEffect(() => { widthRef.current = sidebarWidth; }, [sidebarWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = widthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // Sidebar is on the right, so dragging left = wider
      const delta = dragStartX.current - e.clientX;
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, dragStartWidth.current + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Persist width using ref for latest value
      try { localStorage.setItem(STORAGE_KEY, String(widthRef.current)); } catch { /* ignore */ }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div
      style={{
        width: sidebarWidth,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--divider)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Drag handle on left edge */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          cursor: 'col-resize',
          zIndex: 10,
          background: 'transparent',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = 'rgba(74, 144, 232, 0.4)';
        }}
        onMouseLeave={(e) => {
          if (!isDragging.current) {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          }
        }}
      />

      <TabBar activeTab={activeTab} onTabChange={onTabChange} hasTrace={flowTrace !== null} />

      {activeTab === 'controls' && <ControlsPanel {...props} />}

      {activeTab === 'api-client' && (
        <div style={{ padding: '12px 16px' }}>
          <ApiClientPanel
            baseUrl={apiBaseUrl}
            onBaseUrlChange={onApiBaseUrlChange}
            request={apiRequest}
            response={apiResponse}
            loading={apiLoading}
            error={apiError}
            onMethodChange={onApiMethodChange}
            onUrlChange={onApiUrlChange}
            onSetHeader={onApiSetHeader}
            onRemoveHeader={onApiRemoveHeader}
            onSetQueryParam={onApiSetQueryParam}
            onRemoveQueryParam={onApiRemoveQueryParam}
            onBodyChange={onApiBodyChange}
            onSend={onApiSend}
            onReset={onApiReset}
          />
        </div>
      )}

      {activeTab === 'flow-tracer' && flowTrace && (
        <div style={{ padding: '12px 16px' }}>
          <FlowTracerPanel
            trace={flowTrace}
            currentStepIndex={flowCurrentStepIndex}
            onStepForward={onFlowStepForward}
            onStepBackward={onFlowStepBackward}
            onGoToStep={onFlowGoToStep}
            onStop={onFlowStop}
            onOpenInApiClient={onFlowOpenInApiClient}
          />
        </div>
      )}

      {activeTab === 'database' && (
        <DatabasePanel
          connections={dbConnections}
          activeConnectionId={dbActiveConnectionId}
          schema={dbSchema}
          schemaLoading={dbSchemaLoading}
          schemaError={dbSchemaError}
          queryResult={dbQueryResult}
          queryLoading={dbQueryLoading}
          queryError={dbQueryError}
          envConnections={dbEnvConnections}
          envLoading={dbEnvLoading}
          onAddConnection={onDbAddConnection}
          onUpdateConnection={onDbUpdateConnection}
          onRemoveConnection={onDbRemoveConnection}
          onConnectWithCredentials={onDbConnectWithCredentials}
          onConnectFromEnv={onDbConnectFromEnv}
          onConnectFromCustomKey={onDbConnectFromCustomKey}
          onDisconnect={onDbDisconnect}
          onLoadSchema={onDbLoadSchema}
          onExecuteQuery={onDbExecuteQuery}
          onClearQuery={onDbClearQuery}
          onSelectTable={onDbSelectTable}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsPanel
          settings={settings}
          onUpdateEdgeLabels={onUpdateEdgeLabels}
          onUpdateGraph={onUpdateGraph}
          onUpdateSearch={onUpdateSearch}
          onResetEdgeLabels={onResetEdgeLabels}
          onResetGraph={onResetGraph}
          onResetSearch={onResetSearch}
          onResetAll={onResetAll}
          themeMode={themeMode}
          onThemeChange={onThemeChange}
        />
      )}
    </div>
  );
}
