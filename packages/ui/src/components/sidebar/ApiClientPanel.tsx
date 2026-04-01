import React, { useState } from 'react';
import type { HttpMethod, ProxyResponse } from '../../types';
import KeyValueEditor from './KeyValueEditor';

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const METHOD_COLORS: Record<string, string> = {
  GET: '#7ed321',
  POST: '#f5a623',
  PUT: '#4a90e8',
  PATCH: '#9b59b6',
  DELETE: '#e8534a',
  HEAD: '#888',
  OPTIONS: '#888',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#666',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1a1a2e',
  color: '#e0e0e0',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '6px 8px',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box' as const,
};

const sectionToggle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  fontSize: 11,
  padding: 0,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  width: '100%',
  textAlign: 'left' as const,
};

function StatusBadge({ code }: { code: number }) {
  let color = '#888';
  if (code >= 200 && code < 300) color = '#7ed321';
  else if (code >= 300 && code < 400) color = '#f5a623';
  else if (code >= 400) color = '#e8534a';

  return (
    <span
      style={{
        background: color,
        color: '#fff',
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 12,
        fontWeight: 700,
        fontFamily: 'monospace',
      }}
    >
      {code}
    </span>
  );
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

interface Props {
  baseUrl: string;
  onBaseUrlChange: (url: string) => void;
  request: {
    method: HttpMethod;
    url: string;
    headers: Record<string, string>;
    queryParams: Record<string, string>;
    body: string | null;
  };
  response: ProxyResponse | null;
  loading: boolean;
  error: string | null;
  onMethodChange: (method: HttpMethod) => void;
  onUrlChange: (url: string) => void;
  onSetHeader: (key: string, value: string) => void;
  onRemoveHeader: (key: string) => void;
  onSetQueryParam: (key: string, value: string) => void;
  onRemoveQueryParam: (key: string) => void;
  onBodyChange: (body: string | null) => void;
  onSend: () => void;
  onReset: () => void;
}

export default function ApiClientPanel({
  baseUrl,
  onBaseUrlChange,
  request,
  response,
  loading,
  error,
  onMethodChange,
  onUrlChange,
  onSetHeader,
  onRemoveHeader,
  onSetQueryParam,
  onRemoveQueryParam,
  onBodyChange,
  onSend,
  onReset,
}: Props) {
  const [showHeaders, setShowHeaders] = useState(true);
  const [showParams, setShowParams] = useState(false);
  const [showBody, setShowBody] = useState(false);
  const [showResHeaders, setShowResHeaders] = useState(false);

  const methodColor = METHOD_COLORS[request.method] ?? '#888';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Base URL */}
      <div>
        <p style={labelStyle}>Base URL</p>
        <input
          value={baseUrl}
          onChange={(e) => onBaseUrlChange(e.target.value)}
          placeholder="http://localhost:3000"
          style={inputStyle}
        />
        <p style={{ fontSize: 10, color: '#555', marginTop: 3, marginBottom: 0 }}>
          Prepended to relative paths. Ignored if the endpoint is a full URL.
        </p>
      </div>

      {/* Method + URL row */}
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          value={request.method}
          onChange={(e) => onMethodChange(e.target.value as HttpMethod)}
          style={{
            ...inputStyle,
            width: 90,
            fontWeight: 700,
            color: methodColor,
            cursor: 'pointer',
          }}
        >
          {HTTP_METHODS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          value={request.url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="/api/endpoint"
          style={{ ...inputStyle, flex: 1 }}
          onKeyDown={(e) => { if (e.key === 'Enter') onSend(); }}
        />
      </div>

      {/* Headers */}
      <div>
        <button style={sectionToggle} onClick={() => setShowHeaders(!showHeaders)}>
          <span style={{ fontSize: 8 }}>{showHeaders ? '\u25BC' : '\u25B6'}</span>
          Headers ({Object.keys(request.headers).length})
        </button>
        {showHeaders && (
          <div style={{ marginTop: 4 }}>
            <KeyValueEditor
              entries={request.headers}
              onSet={onSetHeader}
              onRemove={onRemoveHeader}
              keyPlaceholder="Header name"
              valuePlaceholder="Value"
            />
          </div>
        )}
      </div>

      {/* Query Params */}
      <div>
        <button style={sectionToggle} onClick={() => setShowParams(!showParams)}>
          <span style={{ fontSize: 8 }}>{showParams ? '\u25BC' : '\u25B6'}</span>
          Query Params ({Object.keys(request.queryParams).length})
        </button>
        {showParams && (
          <div style={{ marginTop: 4 }}>
            <KeyValueEditor
              entries={request.queryParams}
              onSet={onSetQueryParam}
              onRemove={onRemoveQueryParam}
              keyPlaceholder="Param name"
              valuePlaceholder="Value"
            />
          </div>
        )}
      </div>

      {/* Body */}
      {request.method !== 'GET' && request.method !== 'HEAD' && (
        <div>
          <button style={sectionToggle} onClick={() => setShowBody(!showBody)}>
            <span style={{ fontSize: 8 }}>{showBody ? '\u25BC' : '\u25B6'}</span>
            Request Body
          </button>
          {showBody && (
            <textarea
              value={request.body ?? ''}
              onChange={(e) => onBodyChange(e.target.value || null)}
              placeholder='{"key": "value"}'
              style={{
                ...inputStyle,
                marginTop: 4,
                minHeight: 80,
                resize: 'vertical',
                fontFamily: "'Consolas', 'Monaco', monospace",
                fontSize: 11,
                lineHeight: 1.5,
              }}
            />
          )}
        </div>
      )}

      {/* Send + Reset */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={onSend}
          disabled={loading || !request.url}
          style={{
            flex: 1,
            background: loading ? '#555' : methodColor,
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '7px 0',
            fontSize: 12,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
        <button
          onClick={onReset}
          style={{
            background: '#1a1a2e',
            color: '#888',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '7px 12px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: '#e8534a', fontSize: 11, padding: '4px 0' }}>
          {error}
        </div>
      )}

      {/* Response */}
      {response && (
        <div
          style={{
            borderTop: '1px solid #333',
            paddingTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {/* Status + Duration */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge code={response.statusCode} />
            <span style={{ fontSize: 11, color: '#888' }}>
              {response.statusText}
            </span>
            <span style={{ fontSize: 11, color: '#666', marginLeft: 'auto' }}>
              {response.duration}ms
            </span>
          </div>

          {/* Response Headers */}
          <div>
            <button style={sectionToggle} onClick={() => setShowResHeaders(!showResHeaders)}>
              <span style={{ fontSize: 8 }}>{showResHeaders ? '\u25BC' : '\u25B6'}</span>
              Response Headers ({Object.keys(response.headers).length})
            </button>
            {showResHeaders && (
              <div style={{ marginTop: 4 }}>
                {Object.entries(response.headers).map(([key, value]) => (
                  <div
                    key={key}
                    style={{
                      fontSize: 10,
                      color: '#aaa',
                      fontFamily: 'monospace',
                      marginBottom: 2,
                    }}
                  >
                    <span style={{ color: '#4a90e8' }}>{key}</span>: {value}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Response Body */}
          <div>
            <p style={labelStyle}>Response Body</p>
            <pre
              style={{
                background: '#0a0a1a',
                border: '1px solid #333',
                borderRadius: 4,
                padding: 8,
                maxHeight: 250,
                overflow: 'auto',
                fontSize: 11,
                fontFamily: "'Consolas', 'Monaco', monospace",
                color: '#c9d1d9',
                lineHeight: 1.5,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {formatBody(response.body)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
