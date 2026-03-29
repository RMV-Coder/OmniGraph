import React, { useState } from 'react';
import type {
  DatabaseSavedConnection,
  DatabaseEngine,
  DatabaseSchema,
  DatabaseTable,
  DatabaseQueryResult,
  DatabaseEnvConnection,
} from '../../types';
import type { SavedConnection, ConnectionStatus } from '../../hooks/useDatabase';
import { defaultConnectionConfig } from '../../hooks/useDatabase';

// ─── Styles ─────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#666',
  marginBottom: 3,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1a1a2e',
  color: '#e0e0e0',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '5px 8px',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  background: '#1a1a2e',
  color: '#e0e0e0',
  border: '1px solid #444',
  borderRadius: 4,
  padding: '5px 10px',
  fontSize: 11,
  cursor: 'pointer',
  transition: 'background 0.15s',
};

const btnPrimary: React.CSSProperties = {
  ...btnStyle,
  background: '#4a90e8',
  borderColor: '#4a90e8',
  color: '#fff',
  fontWeight: 600,
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: '#333',
  margin: '12px 0',
};

// ─── Status Indicator ───────────────────────────────────────────────

function StatusDot({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    disconnected: '#555',
    testing: '#f5a623',
    connected: '#4cd964',
    error: '#e8534a',
  };
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colors[status],
        display: 'inline-block',
        flexShrink: 0,
        animation: status === 'testing' ? 'omnigraph-pulse 1s infinite' : undefined,
      }}
      title={status}
    />
  );
}

// ─── Connection Form (metadata only — no password) ──────────────────

interface ConnectionFormProps {
  config: DatabaseSavedConnection;
  onChange: (config: DatabaseSavedConnection) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}

function ConnectionForm({ config, onChange, onSave, onCancel, isNew }: ConnectionFormProps) {
  const update = (patch: Partial<DatabaseSavedConnection>) => {
    onChange({ ...config, ...patch });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <p style={labelStyle}>Connection Name</p>
        <input
          style={inputStyle}
          value={config.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="My Database"
        />
      </div>

      <div>
        <p style={labelStyle}>Engine</p>
        <select
          style={{ ...inputStyle, cursor: 'pointer' }}
          value={config.engine}
          onChange={(e) => {
            const engine = e.target.value as DatabaseEngine;
            update({ engine, port: engine === 'postgresql' ? 5432 : 27017 });
          }}
        >
          <option value="postgresql">PostgreSQL</option>
          <option value="mongodb">MongoDB</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 3 }}>
          <p style={labelStyle}>Host</p>
          <input
            style={inputStyle}
            value={config.host}
            onChange={(e) => update({ host: e.target.value })}
            placeholder="localhost"
          />
        </div>
        <div style={{ flex: 1 }}>
          <p style={labelStyle}>Port</p>
          <input
            style={inputStyle}
            type="number"
            value={config.port}
            onChange={(e) => update({ port: Number(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div>
        <p style={labelStyle}>Database</p>
        <input
          style={inputStyle}
          value={config.database}
          onChange={(e) => update({ database: e.target.value })}
          placeholder={config.engine === 'mongodb' ? 'mydb' : 'postgres'}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ fontSize: 11, color: '#aaa', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.ssl ?? false}
            onChange={(e) => update({ ssl: e.target.checked })}
            style={{ accentColor: '#4a90e8' }}
          />
          SSL
        </label>
        {config.engine === 'mongodb' && (
          <div style={{ flex: 1 }}>
            <input
              style={{ ...inputStyle, padding: '3px 8px', fontSize: 11 }}
              value={config.authSource ?? ''}
              onChange={(e) => update({ authSource: e.target.value || undefined })}
              placeholder="authSource (default: admin)"
            />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button style={btnPrimary} onClick={onSave}>
          {isNew ? 'Add Connection' : 'Save'}
        </button>
        <button style={btnStyle} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Credential Prompt (shown when connecting — not persisted) ──────

function CredentialPrompt({
  connectionName,
  onConnect,
  onCancel,
  testing,
}: {
  connectionName: string;
  onConnect: (username: string, password: string) => void;
  onCancel: () => void;
  testing: boolean;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div style={{
      padding: 10,
      background: '#111125',
      borderRadius: 6,
      marginBottom: 8,
      border: '1px solid #333',
    }}>
      <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 8px' }}>
        Enter credentials for <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{connectionName}</span>
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <p style={labelStyle}>Username</p>
          <input
            style={inputStyle}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="postgres"
            autoFocus
          />
        </div>
        <div style={{ flex: 1 }}>
          <p style={labelStyle}>Password</p>
          <input
            style={inputStyle}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConnect(username, password);
            }}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          style={{ ...btnPrimary, opacity: testing ? 0.6 : 1 }}
          onClick={() => onConnect(username, password)}
          disabled={testing}
        >
          {testing ? 'Connecting...' : 'Connect'}
        </button>
        <button style={btnStyle} onClick={onCancel}>Cancel</button>
      </div>
      <p style={{ fontSize: 9, color: '#555', margin: '6px 0 0', fontStyle: 'italic' }}>
        {'\u{1F512}'} Credentials are sent to the local server once and held in memory only. They are never saved to disk or browser storage.
      </p>
    </div>
  );
}

// ─── .env Auto-Detect Section ───────────────────────────────────────

function EnvSection({
  envConnections,
  envLoading,
  onConnectFromEnv,
  onConnectFromCustomKey,
}: {
  envConnections: DatabaseEnvConnection[];
  envLoading: boolean;
  onConnectFromEnv: (env: DatabaseEnvConnection) => void;
  onConnectFromCustomKey: (key: string) => Promise<string | null>;
}) {
  const [customKey, setCustomKey] = useState('');
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const handleCustomConnect = async () => {
    if (!customKey.trim()) return;
    setCustomLoading(true);
    setCustomError(null);
    const err = await onConnectFromCustomKey(customKey.trim());
    if (err) {
      setCustomError(err);
    } else {
      setCustomKey('');
    }
    setCustomLoading(false);
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...sectionHeaderStyle, marginBottom: 6 }}>
        <span style={{ fontSize: 10 }}>{'\u{1F4C4}'} Environment Variables</span>
      </div>

      {envLoading && (
        <div style={{ fontSize: 11, color: '#666', padding: '4px 0', marginBottom: 6 }}>
          Scanning .env files...
        </div>
      )}

      {envConnections.map((env) => (
        <div
          key={`${env.source}-${env.envKey}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 8px',
            borderRadius: 4,
            marginBottom: 3,
            background: '#111125',
            border: '1px solid #2a2a3e',
          }}
        >
          <span
            style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 3,
              background: env.engine === 'postgresql' ? '#336791' : '#4DB33D',
              color: '#fff', fontWeight: 600, flexShrink: 0,
            }}
          >
            {env.engine === 'postgresql' ? 'PG' : 'Mongo'}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#e0e0e0', fontWeight: 500 }}>{env.envKey}</div>
            <div style={{ fontSize: 9, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {env.host}:{env.port}/{env.database}
              <span style={{ marginLeft: 6, color: '#555' }}>({env.source})</span>
            </div>
          </div>
          <button
            style={{ ...btnStyle, padding: '3px 8px', fontSize: 10, flexShrink: 0 }}
            onClick={() => onConnectFromEnv(env)}
          >
            Connect
          </button>
        </div>
      ))}

      {/* Custom env variable input */}
      <div style={{ marginTop: envConnections.length > 0 ? 8 : 0 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            style={{ ...inputStyle, flex: 1, padding: '4px 8px', fontSize: 11 }}
            value={customKey}
            onChange={(e) => { setCustomKey(e.target.value); setCustomError(null); }}
            placeholder="Custom env key, e.g. MY_DB_URL"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomConnect();
            }}
          />
          <button
            style={{
              ...btnStyle,
              padding: '4px 10px',
              fontSize: 10,
              opacity: customLoading || !customKey.trim() ? 0.5 : 1,
              cursor: customLoading || !customKey.trim() ? 'default' : 'pointer',
            }}
            onClick={handleCustomConnect}
            disabled={customLoading || !customKey.trim()}
          >
            {customLoading ? '...' : 'Connect'}
          </button>
        </div>
        {customError && (
          <div style={{ fontSize: 9, color: '#e8534a', marginTop: 4, wordBreak: 'break-word' }}>
            {customError}
          </div>
        )}
        <p style={{ fontSize: 9, color: '#555', margin: '3px 0 0' }}>
          Enter any env variable name from your project's .env files
        </p>
      </div>
    </div>
  );
}

// ─── Schema Browser ─────────────────────────────────────────────────

function SchemaTree({
  schema,
  onSelectTable,
}: {
  schema: DatabaseSchema;
  onSelectTable?: (table: DatabaseTable) => void;
}) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const toggleTable = (name: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const typeIcon = schema.engine === 'mongodb' ? '\u{1F4E6}' : '\u{1F4CB}';

  return (
    <div style={{ fontSize: 11 }}>
      <div style={{ color: '#888', marginBottom: 6 }}>
        {schema.engine === 'postgresql' ? '\u{1F418}' : '\u{1F343}'}{' '}
        <span style={{ fontWeight: 600, color: '#e0e0e0' }}>{schema.database}</span>
        <span style={{ color: '#555', marginLeft: 6 }}>
          ({schema.tables.length} {schema.engine === 'mongodb' ? 'collections' : 'tables'})
        </span>
      </div>

      {schema.tables.map((table) => {
        const expanded = expandedTables.has(table.name);
        const key = table.schema ? `${table.schema}.${table.name}` : table.name;
        return (
          <div key={key} style={{ marginBottom: 2 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 4px',
                borderRadius: 3,
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onClick={() => toggleTable(table.name)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#1a1a2e'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 8, color: '#666', width: 10, textAlign: 'center' }}>
                {expanded ? '\u25BC' : '\u25B6'}
              </span>
              <span>{typeIcon}</span>
              <span
                style={{ color: '#e0e0e0', fontWeight: 500, flex: 1 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTable?.(table);
                }}
              >
                {table.schema && table.schema !== 'public' ? `${table.schema}.` : ''}
                {table.name}
              </span>
              {table.rowCount !== undefined && (
                <span style={{ color: '#555', fontSize: 10 }}>
                  {table.rowCount.toLocaleString()}
                </span>
              )}
            </div>

            {expanded && (
              <div style={{ marginLeft: 24, borderLeft: '1px solid #333', paddingLeft: 8 }}>
                {table.columns.map((col) => (
                  <div
                    key={col.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 0',
                      color: '#aaa',
                      fontSize: 10,
                    }}
                  >
                    {col.isPrimaryKey && (
                      <span style={{ color: '#f5a623', fontSize: 9 }} title="Primary Key">
                        {'\u{1F511}'}
                      </span>
                    )}
                    <span style={{ color: '#e0e0e0', fontWeight: col.isPrimaryKey ? 600 : 400 }}>
                      {col.name}
                    </span>
                    <span style={{ color: '#666' }}>{col.type}</span>
                    {col.nullable && <span style={{ color: '#555', fontSize: 9 }}>null</span>}
                  </div>
                ))}

                {table.indexes.length > 0 && (
                  <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #2a2a3e' }}>
                    <span style={{ fontSize: 9, color: '#555' }}>Indexes:</span>
                    {table.indexes.map((idx) => (
                      <div key={idx.name} style={{ fontSize: 9, color: '#666', paddingLeft: 4 }}>
                        {idx.unique ? '\u{1F512}' : '\u{1F4D1}'} {idx.name} ({idx.columns.join(', ')})
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Query Runner ───────────────────────────────────────────────────

function QueryRunner({
  engine,
  queryResult,
  queryLoading,
  queryError,
  onExecute,
  onClear,
}: {
  engine: DatabaseEngine;
  queryResult: DatabaseQueryResult | null;
  queryLoading: boolean;
  queryError: string | null;
  onExecute: (query: string, limit?: number) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(100);

  const placeholder =
    engine === 'mongodb'
      ? '{ "collection": "users", "filter": { "age": { "$gt": 25 } } }'
      : 'SELECT * FROM users WHERE active = true';

  const handleExecute = () => {
    if (!query.trim()) return;
    onExecute(query.trim(), limit);
  };

  return (
    <div>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        style={{
          ...inputStyle,
          minHeight: 72,
          resize: 'vertical',
          fontFamily: 'monospace',
          fontSize: 11,
          lineHeight: 1.5,
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            handleExecute();
          }
        }}
      />

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
        <button
          style={{
            ...btnPrimary,
            opacity: queryLoading || !query.trim() ? 0.5 : 1,
            cursor: queryLoading || !query.trim() ? 'default' : 'pointer',
          }}
          onClick={handleExecute}
          disabled={queryLoading || !query.trim()}
        >
          {queryLoading ? 'Running...' : 'Execute'}
        </button>
        <button style={btnStyle} onClick={() => { setQuery(''); onClear(); }}>Clear</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#666' }}>Limit:</span>
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(Math.min(1000, Math.max(1, Number(e.target.value) || 100)))}
          style={{ ...inputStyle, width: 50, padding: '3px 6px', fontSize: 10, textAlign: 'center' }}
        />
      </div>
      <p style={{ fontSize: 9, color: '#555', margin: '4px 0 0' }}>
        Ctrl+Enter to execute
        {engine === 'postgresql' && ' \u2022 Read-only mode'}
      </p>

      {queryError && (
        <div style={{
          marginTop: 8, padding: '6px 8px',
          background: 'rgba(232, 83, 74, 0.15)',
          border: '1px solid rgba(232, 83, 74, 0.3)',
          borderRadius: 4, fontSize: 11, color: '#e8534a', wordBreak: 'break-word',
        }}>
          {queryError}
        </div>
      )}

      {queryResult && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: '#888' }}>
              {queryResult.rowCount} row{queryResult.rowCount !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 10, color: '#555' }}>{queryResult.duration}ms</span>
          </div>
          <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #333', borderRadius: 4 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: 'monospace' }}>
              <thead>
                <tr>
                  {queryResult.columns.map((col) => (
                    <th key={col} style={{
                      background: '#1a1a2e', color: '#aaa', padding: '4px 8px',
                      textAlign: 'left', borderBottom: '1px solid #444',
                      position: 'sticky', top: 0, whiteSpace: 'nowrap', fontWeight: 600,
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queryResult.rows.map((row, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    {queryResult.columns.map((col) => (
                      <td key={col} style={{
                        padding: '3px 8px', color: '#e0e0e0', borderBottom: '1px solid #222',
                        whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                      }} title={String(row[col] ?? '')}>
                        {formatCellValue(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ─── Main Panel ─────────────────────────────────────────────────────

interface DatabasePanelProps {
  connections: SavedConnection[];
  activeConnectionId: string | null;
  schema: DatabaseSchema | null;
  schemaLoading: boolean;
  schemaError: string | null;
  queryResult: DatabaseQueryResult | null;
  queryLoading: boolean;
  queryError: string | null;
  envConnections: DatabaseEnvConnection[];
  envLoading: boolean;
  onAddConnection: (config: DatabaseSavedConnection) => void;
  onUpdateConnection: (id: string, patch: Partial<DatabaseSavedConnection>) => void;
  onRemoveConnection: (id: string) => void;
  onConnectWithCredentials: (id: string, username: string, password: string) => void;
  onConnectFromEnv: (env: DatabaseEnvConnection) => void;
  onConnectFromCustomKey: (key: string) => Promise<string | null>;
  onDisconnect: (id: string) => void;
  onLoadSchema: (id: string) => void;
  onExecuteQuery: (query: string, limit?: number) => void;
  onClearQuery: () => void;
  onSelectTable?: (table: DatabaseTable) => void;
}

export default function DatabasePanel({
  connections,
  activeConnectionId,
  schema,
  schemaLoading,
  schemaError,
  queryResult,
  queryLoading,
  queryError,
  envConnections,
  envLoading,
  onAddConnection,
  onUpdateConnection,
  onRemoveConnection,
  onConnectWithCredentials,
  onConnectFromEnv,
  onConnectFromCustomKey,
  onDisconnect,
  onLoadSchema,
  onExecuteQuery,
  onClearQuery,
  onSelectTable,
}: DatabasePanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formConfig, setFormConfig] = useState<DatabaseSavedConnection>(defaultConnectionConfig());
  const [credentialPromptId, setCredentialPromptId] = useState<string | null>(null);

  const handleAddNew = () => {
    setFormConfig(defaultConnectionConfig());
    setEditingId(null);
    setShowForm(true);
  };

  const handleEdit = (conn: SavedConnection) => {
    setFormConfig({ ...conn.saved });
    setEditingId(conn.saved.id);
    setShowForm(true);
  };

  const handleSave = () => {
    if (editingId) {
      onUpdateConnection(editingId, formConfig);
    } else {
      onAddConnection(formConfig);
    }
    setShowForm(false);
    setEditingId(null);
  };

  const activeConn = connections.find((c) => c.saved.id === activeConnectionId);

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <style>{`
        @keyframes omnigraph-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* ─── .env Auto-Detection ─────────────────────────────────── */}
      <EnvSection
        envConnections={envConnections}
        envLoading={envLoading}
        onConnectFromEnv={onConnectFromEnv}
        onConnectFromCustomKey={onConnectFromCustomKey}
      />

      {/* ─── Connections Section ──────────────────────────────────── */}
      <div>
        <div style={sectionHeaderStyle}>
          <span>Manual Connections</span>
          <button
            style={{ ...btnStyle, padding: '2px 8px', fontSize: 10 }}
            onClick={handleAddNew}
          >
            + New
          </button>
        </div>

        {showForm && (
          <div style={{ marginBottom: 12, padding: 10, background: '#111125', borderRadius: 6 }}>
            <ConnectionForm
              config={formConfig}
              onChange={setFormConfig}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingId(null); }}
              isNew={!editingId}
            />
          </div>
        )}

        {/* Credential prompt */}
        {credentialPromptId && (() => {
          const conn = connections.find((c) => c.saved.id === credentialPromptId);
          if (!conn) return null;
          return (
            <CredentialPrompt
              connectionName={conn.saved.name || `${conn.saved.host}:${conn.saved.port}`}
              onConnect={(username, password) => {
                onConnectWithCredentials(credentialPromptId, username, password);
                setCredentialPromptId(null);
              }}
              onCancel={() => setCredentialPromptId(null)}
              testing={conn.status === 'testing'}
            />
          );
        })()}

        {connections.length === 0 && !showForm && envConnections.length === 0 && (
          <p style={{ fontSize: 11, color: '#555', fontStyle: 'italic', margin: '0 0 8px' }}>
            No connections yet. Click "+ New" to add one, or place a DATABASE_URL in your project's .env file.
          </p>
        )}

        {connections.map((conn) => (
          <div
            key={conn.saved.id}
            style={{
              padding: '8px 10px',
              background: activeConnectionId === conn.saved.id ? '#1a1a3e' : 'transparent',
              borderRadius: 4,
              marginBottom: 4,
              border: activeConnectionId === conn.saved.id ? '1px solid #333' : '1px solid transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <StatusDot status={conn.status} />
              <span style={{ fontSize: 12, color: '#e0e0e0', fontWeight: 500, flex: 1 }}>
                {conn.saved.name || `${conn.saved.host}:${conn.saved.port}`}
              </span>
              <span
                style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 3,
                  background: conn.saved.engine === 'postgresql' ? '#336791' : '#4DB33D',
                  color: '#fff', fontWeight: 600,
                }}
              >
                {conn.saved.engine === 'postgresql' ? 'PG' : 'Mongo'}
              </span>
            </div>

            <div style={{ fontSize: 10, color: '#666', marginBottom: 6 }}>
              {conn.saved.host}:{conn.saved.port}/{conn.saved.database}
              {conn.serverVersion && (
                <span style={{ marginLeft: 6, color: '#555' }}>({conn.serverVersion})</span>
              )}
            </div>

            {conn.status === 'error' && conn.error && (
              <div style={{ fontSize: 10, color: '#e8534a', marginBottom: 6, wordBreak: 'break-word' }}>
                {conn.error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {conn.status !== 'connected' ? (
                <button
                  style={{ ...btnStyle, padding: '2px 8px', fontSize: 10, background: '#336791', borderColor: '#336791', color: '#fff' }}
                  onClick={() => setCredentialPromptId(conn.saved.id)}
                  disabled={conn.status === 'testing'}
                >
                  {conn.status === 'testing' ? 'Connecting...' : 'Connect'}
                </button>
              ) : (
                <>
                  <button
                    style={{ ...btnStyle, padding: '2px 8px', fontSize: 10, background: '#336791', borderColor: '#336791', color: '#fff' }}
                    onClick={() => onLoadSchema(conn.saved.id)}
                    disabled={schemaLoading}
                  >
                    {schemaLoading && activeConnectionId === conn.saved.id ? 'Loading...' : 'Load Schema'}
                  </button>
                  <button
                    style={{ ...btnStyle, padding: '2px 8px', fontSize: 10, color: '#f5a623' }}
                    onClick={() => onDisconnect(conn.saved.id)}
                  >
                    Disconnect
                  </button>
                </>
              )}
              <button
                style={{ ...btnStyle, padding: '2px 8px', fontSize: 10 }}
                onClick={() => handleEdit(conn)}
              >
                Edit
              </button>
              <div style={{ flex: 1 }} />
              <button
                style={{ ...btnStyle, padding: '2px 8px', fontSize: 10, color: '#e8534a', borderColor: '#e8534a' }}
                onClick={() => onRemoveConnection(conn.saved.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Schema Browser ──────────────────────────────────────── */}
      {(schema || schemaLoading || schemaError) && (
        <>
          <div style={dividerStyle} />
          <div>
            <div style={sectionHeaderStyle}><span>Schema</span></div>
            {schemaLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 11 }}>
                <span style={{ animation: 'omnigraph-pulse 1s infinite' }}>{'\u{23F3}'}</span>
                Loading schema...
              </div>
            )}
            {schemaError && (
              <div style={{
                padding: '6px 8px', background: 'rgba(232, 83, 74, 0.15)',
                border: '1px solid rgba(232, 83, 74, 0.3)', borderRadius: 4,
                fontSize: 11, color: '#e8534a',
              }}>
                {schemaError}
              </div>
            )}
            {schema && (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                <SchemaTree schema={schema} onSelectTable={onSelectTable} />
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── Query Runner ────────────────────────────────────────── */}
      {activeConn && activeConn.status === 'connected' && (
        <>
          <div style={dividerStyle} />
          <div>
            <div style={sectionHeaderStyle}><span>Query</span></div>
            <QueryRunner
              engine={activeConn.saved.engine}
              queryResult={queryResult}
              queryLoading={queryLoading}
              queryError={queryError}
              onExecute={onExecuteQuery}
              onClear={onClearQuery}
            />
          </div>
        </>
      )}
    </div>
  );
}
