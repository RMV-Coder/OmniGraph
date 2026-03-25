import React, { useState } from 'react';

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginBottom: 4,
  alignItems: 'center',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: '#1a1a2e',
  color: '#e0e0e0',
  border: '1px solid #444',
  borderRadius: 3,
  padding: '3px 6px',
  fontSize: 11,
  outline: 'none',
  minWidth: 0,
};

const deleteBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#e8534a',
  cursor: 'pointer',
  fontSize: 14,
  padding: '0 2px',
  lineHeight: 1,
  flexShrink: 0,
};

const addBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px dashed #555',
  color: '#888',
  cursor: 'pointer',
  fontSize: 11,
  padding: '3px 8px',
  borderRadius: 3,
  width: '100%',
  textAlign: 'center' as const,
};

interface Props {
  entries: Record<string, string>;
  onSet: (key: string, value: string) => void;
  onRemove: (key: string) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

export default function KeyValueEditor({
  entries,
  onSet,
  onRemove,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}: Props) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const pairs = Object.entries(entries);

  const handleAdd = () => {
    if (newKey.trim()) {
      onSet(newKey.trim(), newValue);
      setNewKey('');
      setNewValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <div>
      {pairs.map(([key, value]) => (
        <div key={key} style={rowStyle}>
          <input
            style={{ ...inputStyle, fontWeight: 600 }}
            value={key}
            readOnly
            title={key}
          />
          <input
            style={inputStyle}
            value={value}
            onChange={(e) => onSet(key, e.target.value)}
            title={value}
          />
          <button
            style={deleteBtnStyle}
            onClick={() => onRemove(key)}
            title="Remove"
          >
            &times;
          </button>
        </div>
      ))}

      {/* Add new row */}
      <div style={rowStyle}>
        <input
          style={inputStyle}
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={keyPlaceholder}
        />
        <input
          style={inputStyle}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={valuePlaceholder}
        />
        <button
          style={{ ...deleteBtnStyle, color: '#7ed321', fontSize: 16 }}
          onClick={handleAdd}
          title="Add"
        >
          +
        </button>
      </div>
    </div>
  );
}
