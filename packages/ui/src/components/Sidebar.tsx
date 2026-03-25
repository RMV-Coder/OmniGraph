import React from 'react';
import type { LayoutPreset, MindmapDirection } from '../layout';
import { LAYOUT_PRESETS } from '../layout';
import { NODE_COLORS } from '../layout/shared';
import type { OmniNode, OmniEdge, HttpMethod, ProxyResponse, FlowTrace } from '../types';
import CodeViewer from './CodeViewer';
import ApiClientPanel from './sidebar/ApiClientPanel';
import FlowTracerPanel from './sidebar/FlowTracerPanel';

export type SidebarTab = 'controls' | 'api-client' | 'flow-tracer';

const NODE_TYPE_LABELS: Record<string, string> = {
  'nestjs-controller': 'Controller',
  'nestjs-injectable': 'Injectable',
  'nestjs-module': 'Module',
  'typescript-file': 'TypeScript',
  'javascript-file': 'JavaScript',
  'python-file': 'Python',
  'python-fastapi-route': 'FastAPI Route',
  'python-django-view': 'Django View',
  'python-django-model': 'Django Model',
  'php-file': 'PHP',
  'php-laravel-controller': 'Laravel Controller',
  'php-laravel-model': 'Laravel Model',
  'php-laravel-middleware': 'Laravel Middleware',
  'php-laravel-route': 'Laravel Route',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: '#1a1a2e',
  color: '#e0e0e0',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '4px 8px',
  fontSize: 12,
  cursor: 'pointer',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#666',
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
  background: '#333',
  margin: '4px 0',
};

const exportBtnStyle: React.CSSProperties = {
  flex: 1,
  background: '#1a1a2e',
  color: '#e0e0e0',
  border: '1px solid #444',
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
  activeTypes: Set<string>;
  onTypeToggle: (type: string) => void;
  availableTypes: string[];
  matchCount: number;
  totalCount: number;
  // Inspector
  selectedNode: OmniNode | null;
  onCloseInspector: () => void;
  // Export
  onExportPng: () => void;
  onExportSvg: () => void;
  onExportJson: () => void;
  // API Client
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
  ];

  return (
    <div
      style={{
        display: 'flex',
        borderBottom: '1px solid #333',
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
              background: activeTab === t.key ? '#1a1a2e' : 'transparent',
              color: activeTab === t.key ? '#fff' : '#666',
              border: 'none',
              borderBottom: activeTab === t.key ? '2px solid #4a90e8' : '2px solid transparent',
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

// ─── Controls Panel ──────────────────────────────────────────────────

function ControlsPanel({
  layoutPreset, onLayoutChange, mindmapDirection, onDirectionChange,
  searchQuery, onSearchChange, activeTypes, onTypeToggle, availableTypes,
  matchCount, totalCount, selectedNode, onCloseInspector,
  onExportPng, onExportSvg, onExportJson,
}: Pick<Props,
  'layoutPreset' | 'onLayoutChange' | 'mindmapDirection' | 'onDirectionChange' |
  'searchQuery' | 'onSearchChange' | 'activeTypes' | 'onTypeToggle' | 'availableTypes' |
  'matchCount' | 'totalCount' | 'selectedNode' | 'onCloseInspector' |
  'onExportPng' | 'onExportSvg' | 'onExportJson'
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

        {/* Export */}
        <div style={{ marginTop: 10 }}>
          <p style={labelStyle}>Export</p>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onExportPng} style={exportBtnStyle}>PNG</button>
            <button onClick={onExportSvg} style={exportBtnStyle}>SVG</button>
            <button onClick={onExportJson} style={exportBtnStyle}>JSON</button>
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
              {selectedNode.type}
            </span>
          </div>
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
          <div style={dividerStyle} />
          <CodeViewer filePath={selectedNode.metadata.filePath ?? selectedNode.id} />
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

export default function Sidebar(props: Props) {
  const {
    activeTab, onTabChange,
    // API Client
    apiRequest, apiResponse, apiLoading, apiError,
    onApiMethodChange, onApiUrlChange, onApiSetHeader, onApiRemoveHeader,
    onApiSetQueryParam, onApiRemoveQueryParam, onApiBodyChange, onApiSend, onApiReset,
    // Flow Tracer
    flowTrace, flowCurrentStepIndex,
    onFlowStepForward, onFlowStepBackward, onFlowGoToStep, onFlowStop, onFlowOpenInApiClient,
  } = props;

  const sidebarWidth = activeTab === 'controls' ? 280 : 380;

  return (
    <div
      style={{
        width: sidebarWidth,
        background: '#0d0d1e',
        borderLeft: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        flexShrink: 0,
        transition: 'width 0.2s ease',
      }}
    >
      <TabBar activeTab={activeTab} onTabChange={onTabChange} hasTrace={flowTrace !== null} />

      {activeTab === 'controls' && <ControlsPanel {...props} />}

      {activeTab === 'api-client' && (
        <div style={{ padding: '12px 16px' }}>
          <ApiClientPanel
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
    </div>
  );
}
