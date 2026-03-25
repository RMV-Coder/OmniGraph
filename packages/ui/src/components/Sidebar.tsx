import React from 'react';
import type { LayoutPreset, MindmapDirection } from '../layout';
import { LAYOUT_PRESETS } from '../layout';
import { NODE_COLORS } from '../layout/shared';
import type { OmniNode } from '../types';

const NODE_TYPE_LABELS: Record<string, string> = {
  'nestjs-controller': 'Controller',
  'nestjs-injectable': 'Injectable',
  'nestjs-module': 'Module',
  'typescript-file': 'TypeScript',
  'javascript-file': 'JavaScript',
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

interface Props {
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
}

export default function Sidebar({
  layoutPreset,
  onLayoutChange,
  mindmapDirection,
  onDirectionChange,
  searchQuery,
  onSearchChange,
  activeTypes,
  onTypeToggle,
  availableTypes,
  matchCount,
  totalCount,
  selectedNode,
  onCloseInspector,
}: Props) {
  return (
    <div
      style={{
        width: 280,
        background: '#0d0d1e',
        borderLeft: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      {/* === Controls Section === */}
      <div style={{ padding: '16px 16px 12px' }}>
        {/* Layout selector */}
        <div style={{ marginBottom: 12 }}>
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

        {/* Mindmap direction */}
        {layoutPreset === 'mindmap' && (
          <div style={{ marginBottom: 12 }}>
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
              style={{
                ...selectStyle,
                padding: '6px 28px 6px 8px',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 0,
                  lineHeight: 1,
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
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: color,
                      display: 'inline-block',
                      opacity: active ? 1 : 0.4,
                    }}
                  />
                  {NODE_TYPE_LABELS[type] ?? type}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* === Divider === */}
      <div style={dividerStyle} />

      {/* === Node Inspector Section === */}
      {selectedNode ? (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 14, color: '#fff', margin: 0 }}>{selectedNode.label}</h2>
            <button
              onClick={onCloseInspector}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: 16,
                padding: 0,
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>

          <div>
            <span
              style={{
                background: NODE_COLORS[selectedNode.type] ?? '#888',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 10,
                color: '#fff',
                display: 'inline-block',
              }}
            >
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

          <div>
            <p style={labelStyle}>Node ID</p>
            <p style={{ fontSize: 11, color: '#888', wordBreak: 'break-all', margin: 0 }}>{selectedNode.id}</p>
          </div>
        </div>
      ) : (
        <div style={{ padding: '12px 16px' }}>
          <p style={{ fontSize: 11, color: '#555', fontStyle: 'italic', margin: 0 }}>
            Click a node to inspect
          </p>
        </div>
      )}
    </div>
  );
}
