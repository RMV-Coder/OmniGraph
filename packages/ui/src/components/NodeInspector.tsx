import React from 'react';
import { OmniNode } from '../types';

interface Props {
  node: OmniNode;
  onClose: () => void;
}

export default function NodeInspector({ node, onClose }: Props) {
  return (
    <div
      style={{
        width: 340,
        background: '#0d0d1e',
        borderLeft: '1px solid #333',
        padding: 20,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 16, color: '#fff' }}>{node.label}</h2>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: 18,
          }}
        >
          &times;
        </button>
      </div>

      <div>
        <span
          style={{
            background: '#1a1a3e',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
            color: '#aaa',
            display: 'inline-block',
          }}
        >
          {node.type}
        </span>
      </div>

      <div>
        <p style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>FILE PATH</p>
        <p style={{ fontSize: 12, color: '#e0e0e0', wordBreak: 'break-all' }}>
          {node.metadata.filePath ?? node.id}
        </p>
      </div>

      {node.metadata.route && (
        <div>
          <p style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>ROUTE</p>
          <p style={{ fontSize: 12, color: '#e0e0e0' }}>{node.metadata.route}</p>
        </div>
      )}

      <div>
        <p style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>NODE ID</p>
        <p style={{ fontSize: 12, color: '#888', wordBreak: 'break-all' }}>{node.id}</p>
      </div>
    </div>
  );
}
