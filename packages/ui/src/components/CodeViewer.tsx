import React, { useEffect, useState, useRef } from 'react';

/** Simple language detection based on file extension */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    py: 'python',
    php: 'php',
  };
  return map[ext] ?? 'text';
}

/** Minimal keyword sets for basic syntax coloring */
const KEYWORDS: Record<string, Set<string>> = {
  typescript: new Set([
    'import', 'export', 'from', 'const', 'let', 'var', 'function', 'class',
    'interface', 'type', 'extends', 'implements', 'return', 'if', 'else',
    'for', 'while', 'async', 'await', 'new', 'this', 'super', 'static',
    'public', 'private', 'protected', 'readonly', 'abstract', 'enum',
    'namespace', 'module', 'declare', 'default', 'switch', 'case', 'break',
    'try', 'catch', 'throw', 'finally', 'typeof', 'instanceof', 'void',
    'null', 'undefined', 'true', 'false', 'in', 'of', 'as',
  ]),
  javascript: new Set([
    'import', 'export', 'from', 'const', 'let', 'var', 'function', 'class',
    'extends', 'return', 'if', 'else', 'for', 'while', 'async', 'await',
    'new', 'this', 'super', 'static', 'default', 'switch', 'case', 'break',
    'try', 'catch', 'throw', 'finally', 'typeof', 'instanceof', 'void',
    'null', 'undefined', 'true', 'false', 'in', 'of', 'yield',
  ]),
  python: new Set([
    'import', 'from', 'def', 'class', 'return', 'if', 'elif', 'else',
    'for', 'while', 'with', 'as', 'try', 'except', 'finally', 'raise',
    'pass', 'break', 'continue', 'and', 'or', 'not', 'in', 'is', 'None',
    'True', 'False', 'lambda', 'yield', 'async', 'await', 'self',
    'global', 'nonlocal', 'del', 'assert',
  ]),
  php: new Set([
    'use', 'namespace', 'class', 'function', 'public', 'private',
    'protected', 'static', 'abstract', 'interface', 'extends', 'implements',
    'return', 'if', 'else', 'elseif', 'for', 'foreach', 'while', 'switch',
    'case', 'break', 'try', 'catch', 'throw', 'finally', 'new', 'echo',
    'require', 'require_once', 'include', 'include_once', 'null', 'true',
    'false', 'array', 'const', 'var', 'as', 'trait',
  ]),
};

/** Colorize a single line with basic syntax highlighting */
function tokenizeLine(line: string, lang: string): React.ReactNode[] {
  const kw = KEYWORDS[lang] ?? new Set<string>();
  const tokens: React.ReactNode[] = [];
  let i = 0;

  while (i < line.length) {
    // Comments
    if (
      (lang !== 'python' && line.startsWith('//', i)) ||
      (lang === 'python' && line[i] === '#') ||
      (lang === 'php' && line.startsWith('//', i))
    ) {
      tokens.push(
        <span key={i} style={{ color: '#6a737d' }}>{line.slice(i)}</span>,
      );
      break;
    }

    // Strings
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++; // skip escaped
        j++;
      }
      j++; // include closing quote
      tokens.push(
        <span key={i} style={{ color: '#9ecbff' }}>{line.slice(i, j)}</span>,
      );
      i = j;
      continue;
    }

    // Decorators / annotations
    if (line[i] === '@') {
      let j = i + 1;
      while (j < line.length && /[\w.]/.test(line[j])) j++;
      tokens.push(
        <span key={i} style={{ color: '#b392f0' }}>{line.slice(i, j)}</span>,
      );
      i = j;
      continue;
    }

    // Words (keywords / identifiers)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i + 1;
      while (j < line.length && /[\w$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      if (kw.has(word)) {
        tokens.push(
          <span key={i} style={{ color: '#ff7b72' }}>{word}</span>,
        );
      } else {
        tokens.push(<span key={i}>{word}</span>);
      }
      i = j;
      continue;
    }

    // Numbers
    if (/\d/.test(line[i])) {
      let j = i + 1;
      while (j < line.length && /[\d.xXa-fA-F]/.test(line[j])) j++;
      tokens.push(
        <span key={i} style={{ color: '#79c0ff' }}>{line.slice(i, j)}</span>,
      );
      i = j;
      continue;
    }

    // Default character
    tokens.push(<span key={i}>{line[i]}</span>);
    i++;
  }

  return tokens;
}

interface Props {
  filePath: string;
}

export default function CodeViewer({ filePath }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setContent(null);
    setError(null);
    setLoading(true);
    setCollapsed(false);

    fetch(`/api/file?path=${encodeURIComponent(filePath)}`)
      .then((r) => {
        if (!r.ok) return r.json().then((d: { error?: string }) => { throw new Error(d.error ?? `HTTP ${r.status}`); });
        return r.json();
      })
      .then((data: { content: string }) => {
        setContent(data.content);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err instanceof Error ? err.message : err));
        setLoading(false);
      });
  }, [filePath]);

  if (loading) {
    return (
      <div style={{ padding: '8px 0', fontSize: 11, color: '#666' }}>
        Loading source...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '8px 0', fontSize: 11, color: '#e8534a' }}>
        {error}
      </div>
    );
  }

  if (!content) return null;

  const lang = detectLanguage(filePath);
  const lines = content.split('\n');
  const gutterWidth = String(lines.length).length;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: '#666',
            marginBottom: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            margin: 0,
          }}
        >
          Source ({lines.length} lines)
        </p>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            fontSize: 10,
            padding: '2px 4px',
          }}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>
      {!collapsed && (
        <div
          ref={containerRef}
          style={{
            background: '#0a0a1a',
            border: '1px solid #333',
            borderRadius: 4,
            maxHeight: 320,
            overflowY: 'auto',
            overflowX: 'auto',
            fontSize: 11,
            fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
            lineHeight: 1.5,
          }}
        >
          <table
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              minWidth: 'max-content',
            }}
          >
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td
                    style={{
                      color: '#444',
                      textAlign: 'right',
                      paddingRight: 8,
                      paddingLeft: 8,
                      userSelect: 'none',
                      width: gutterWidth * 8 + 16,
                      borderRight: '1px solid #222',
                      verticalAlign: 'top',
                    }}
                  >
                    {i + 1}
                  </td>
                  <td
                    style={{
                      paddingLeft: 8,
                      paddingRight: 8,
                      color: '#c9d1d9',
                      whiteSpace: 'pre',
                    }}
                  >
                    {tokenizeLine(line, lang)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
