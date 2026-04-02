/**
 * HTTP Call Detector
 *
 * Scans source files for outbound HTTP client calls (fetch, axios, httpClient,
 * requests, Guzzle, etc.) and extracts the HTTP method and URL path.
 *
 * This is heuristic-based — it uses regex patterns to detect common client
 * libraries across TypeScript/JavaScript, Python, and PHP.
 */

export interface HttpCall {
  /** HTTP method (GET, POST, PUT, PATCH, DELETE) or '*' if unknown */
  method: string;
  /** The URL path or pattern extracted from the call (e.g., '/api/users') */
  url: string;
  /** Line number where the call was detected */
  line: number;
}

/** Patterns that map HTTP client calls to an HTTP method */
interface CallPattern {
  /** Regex to match. Group 1 must capture the URL string. */
  pattern: RegExp;
  /** HTTP method this pattern implies, or null to extract from pattern */
  method: string | null;
  /** Group index for method (if method is null) */
  methodGroup?: number;
  /** Group index for URL */
  urlGroup: number;
}

// ─── Pattern Definitions ────────────────────────────────────────────

const TS_JS_PATTERNS: CallPattern[] = [
  // fetch('/api/...') or fetch("/api/...") or fetch(`/api/...`)
  {
    pattern: /\bfetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
    method: 'GET', // fetch defaults to GET; POST is usually in options
    urlGroup: 1,
  },
  // fetch('/api/...', { method: 'POST' }) — detect method override
  {
    pattern: /\bfetch\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{[^}]*method\s*:\s*['"`](\w+)['"`]/g,
    method: null,
    urlGroup: 1,
    methodGroup: 2,
  },
  // axios.get('/api/...'), axios.post('/api/...'), etc.
  {
    pattern: /\baxios\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    method: null,
    methodGroup: 1,
    urlGroup: 2,
  },
  // axios({ url: '/api/...', method: 'POST' }) or axios({ method: 'POST', url: '/api/...' })
  {
    pattern: /\baxios\s*\(\s*\{[^}]*url\s*:\s*['"`]([^'"`]+)['"`]/g,
    method: '*',
    urlGroup: 1,
  },
  // this.http.get('/api/...') or httpClient.get('/api/...')  — Angular-style
  {
    pattern: /(?:this\.)?(?:http|httpClient)\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    method: null,
    methodGroup: 1,
    urlGroup: 2,
  },
  // $.ajax({ url: '/api/...' }) or jQuery.ajax(...)
  {
    pattern: /(?:\$|jQuery)\s*\.\s*ajax\s*\(\s*\{[^}]*url\s*:\s*['"`]([^'"`]+)['"`]/g,
    method: '*',
    urlGroup: 1,
  },
  // $.get('/api/...'), $.post('/api/...')
  {
    pattern: /(?:\$|jQuery)\s*\.\s*(get|post)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    method: null,
    methodGroup: 1,
    urlGroup: 2,
  },
  // ky.get('/api/...'), ky.post('/api/...'), got.get('/api/...'), etc.
  {
    pattern: /\b(?:ky|got|superagent|request)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    method: null,
    methodGroup: 1,
    urlGroup: 2,
  },
  // fetch(`/api/users/${id}`) — template literal with interpolations (must contain ${})
  {
    pattern: /\bfetch\s*\(\s*`([^`]*\$\{[^`]*)`/g,
    method: 'GET',
    urlGroup: 1,
  },
  // fetch(`/api/users/${id}`, { method: 'POST' }) — template literal with method override
  {
    pattern: /\bfetch\s*\(\s*`([^`]*\$\{[^`]*)`\s*,\s*\{[^}]*method\s*:\s*['"`](\w+)['"`]/g,
    method: null,
    urlGroup: 1,
    methodGroup: 2,
  },
  // fetch('/api/users/' + id) — string concatenation
  {
    pattern: /\bfetch\s*\(\s*['"]([^'"]+)['"]\s*\+/g,
    method: 'GET',
    urlGroup: 1,
  },
  // Next.js revalidatePath('/api/users')
  {
    pattern: /\brevalidatePath\s*\(\s*['"`]([^'"`]+)['"`]/g,
    method: '*',
    urlGroup: 1,
  },
  // Next.js revalidateTag('users')
  {
    pattern: /\brevalidateTag\s*\(\s*['"`]([^'"`]+)['"`]/g,
    method: '*',
    urlGroup: 1,
  },
  // Next.js redirect('/somewhere')
  {
    pattern: /\bredirect\s*\(\s*['"`]([^'"`]+)['"`]/g,
    method: 'GET',
    urlGroup: 1,
  },
];

const PYTHON_PATTERNS: CallPattern[] = [
  // requests.get('/api/...'), requests.post('/api/...'), etc.
  {
    pattern: /\brequests\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    method: null,
    methodGroup: 1,
    urlGroup: 2,
  },
  // httpx.get('/api/...'), httpx.AsyncClient().get('/api/...')
  {
    pattern: /\bhttpx\s*(?:\.\w+\(\))?\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    method: null,
    methodGroup: 1,
    urlGroup: 2,
  },
  // aiohttp session.get('/api/...')
  {
    pattern: /\bsession\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    method: null,
    methodGroup: 1,
    urlGroup: 2,
  },
  // urllib.request.urlopen('/api/...')
  {
    pattern: /\burllib\s*\.?\s*request\s*\.\s*urlopen\s*\(\s*['"`]([^'"`]+)['"`]/g,
    method: 'GET',
    urlGroup: 1,
  },
];

const PHP_PATTERNS: CallPattern[] = [
  // Http::get('/api/...'), Http::post('/api/...') — Laravel HTTP client
  {
    pattern: /\bHttp\s*::\s*(get|post|put|patch|delete|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    method: null,
    methodGroup: 1,
    urlGroup: 2,
  },
  // $client->get('/api/...'), $client->request('GET', '/api/...')
  {
    pattern: /\$\w+\s*->\s*(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    method: null,
    methodGroup: 1,
    urlGroup: 2,
  },
  // $client->request('GET', '/api/...')
  {
    pattern: /\$\w+\s*->\s*request\s*\(\s*['"`](\w+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/gi,
    method: null,
    methodGroup: 1,
    urlGroup: 2,
  },
  // file_get_contents('http://...')
  {
    pattern: /\bfile_get_contents\s*\(\s*['"`](https?:\/\/[^'"`]+)['"`]/g,
    method: 'GET',
    urlGroup: 1,
  },
];

/** Detect the language family from file extension */
function getLanguage(filePath: string): 'ts' | 'py' | 'php' | null {
  if (/\.(ts|tsx|js|jsx)$/i.test(filePath)) return 'ts';
  if (/\.py$/i.test(filePath)) return 'py';
  if (/\.php$/i.test(filePath)) return 'php';
  return null;
}

/**
 * Normalize a detected URL to a comparable path:
 * - Strip protocol and host (http://localhost:3000/api/users → /api/users)
 * - Remove trailing slashes
 * - Lowercase for comparison
 * - Strip common base URL variables (${BASE_URL}, etc.)
 */
export function normalizeUrl(url: string): string {
  let normalized = url;

  // Strip protocol + host
  normalized = normalized.replace(/^https?:\/\/[^/]+/, '');

  // Strip template literal expressions at the start (${baseUrl}, ${API_URL}, etc.)
  normalized = normalized.replace(/^\$\{[^}]+\}/, '');

  // Replace remaining ${...} interpolations with :param wildcard segments
  // e.g. /api/users/${id} → /api/users/:id, /api/posts/${postId}/comments → /api/posts/:postId/comments
  normalized = normalized.replace(/\$\{([^}]+)\}/g, (_match, expr) => {
    // Use the variable name as the param name (strip any property access / method calls)
    const paramName = expr.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'param';
    return ':' + paramName;
  });

  // If the URL ends with a trailing slash from string concatenation (e.g. '/api/users/'),
  // append :param since the concatenated part is a dynamic segment
  if (normalized.endsWith('/') && normalized !== '/') {
    normalized = normalized + ':param';
  }

  // If nothing remains after stripping, return original
  if (!normalized || normalized === '/') return url.toLowerCase();

  // Ensure starts with /
  if (!normalized.startsWith('/')) normalized = '/' + normalized;

  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '') || '/';

  return normalized.toLowerCase();
}

/**
 * Scan a source file for HTTP client calls.
 *
 * @param filePath - The file path (used to determine language)
 * @param source - The file content
 * @returns Array of detected HTTP calls
 */
export function detectHttpCalls(filePath: string, source: string): HttpCall[] {
  const lang = getLanguage(filePath);
  if (!lang) return [];

  let patterns: CallPattern[];
  switch (lang) {
    case 'ts': patterns = TS_JS_PATTERNS; break;
    case 'py': patterns = PYTHON_PATTERNS; break;
    case 'php': patterns = PHP_PATTERNS; break;
  }

  const calls: HttpCall[] = [];
  const lines = source.split('\n');

  for (const { pattern, method, methodGroup, urlGroup } of patterns) {
    // Reset regex state
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = re.exec(source)) !== null) {
      const rawUrl = match[urlGroup];
      if (!rawUrl) continue;

      // Skip if URL looks like a local file path (not an API call)
      if (rawUrl.startsWith('./') || rawUrl.startsWith('../')) continue;
      // Skip data URIs, blob URIs, etc.
      if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) continue;

      const detectedMethod = method ?? (methodGroup ? match[methodGroup]?.toUpperCase() : '*') ?? '*';
      const url = normalizeUrl(rawUrl);

      // Find line number
      const charIndex = match.index;
      let lineNum = 1;
      for (let i = 0; i < charIndex && i < source.length; i++) {
        if (source[i] === '\n') lineNum++;
      }

      calls.push({ method: detectedMethod, url, line: lineNum });
    }
  }

  return calls;
}
