import React from 'react';
import type { NodeProps } from 'reactflow';

export default function DirectoryGroupNode({ data }: NodeProps) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px dashed #444',
        borderRadius: 12,
      }}
    >
      <div
        style={{
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: '#777',
          letterSpacing: '0.5px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {data.label}
      </div>
    </div>
  );
}
