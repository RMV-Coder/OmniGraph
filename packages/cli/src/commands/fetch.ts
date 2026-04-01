import { Command } from 'commander';
import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import { URL } from 'url';
import { printOutput, printError, bold, dim, green, yellow } from '../lib/format';

export const fetchCommand = new Command('fetch')
  .description('Make HTTP requests to API endpoints (like curl/Postman)')
  .requiredOption('--url <url>', 'Target URL (e.g. http://localhost:3000/api/users)')
  .option('--method <method>', 'HTTP method', 'GET')
  .option('--header <header...>', 'Headers in "Key: Value" format (repeatable)')
  .option('--body <json>', 'Request body (JSON string)')
  .option('--body-file <path>', 'Read request body from file')
  .option('--env-token <key>', 'Read auth token from .env and add as Bearer token')
  .option('--cookie <cookie>', 'Cookie header value')
  .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
  .option('--from <file>', 'Context: which source file triggers this call (for documentation)')
  .action(async (opts, cmd) => {
    const targetPath = cmd.parent?.opts().path ?? '.';
    const json = cmd.parent?.opts().json ?? false;
    const fmtOpts = { json };

    // Build headers
    const headers: Record<string, string> = {
      'User-Agent': 'OmniGraph-CLI/1.0',
    };

    if (opts.header) {
      for (const h of opts.header) {
        const idx = h.indexOf(':');
        if (idx > 0) {
          headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
        }
      }
    }

    if (opts.cookie) {
      headers['Cookie'] = opts.cookie;
    }

    // Resolve env token
    if (opts.envToken) {
      const token = resolveEnvToken(path.resolve(targetPath), opts.envToken);
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        printError(`Could not find ${opts.envToken} in .env files`, fmtOpts);
        process.exit(1);
      }
    }

    // Build body
    let body: string | null = null;
    if (opts.bodyFile) {
      const bodyPath = path.resolve(opts.bodyFile);
      if (!fs.existsSync(bodyPath)) {
        printError(`Body file not found: ${bodyPath}`, fmtOpts);
        process.exit(1);
      }
      body = fs.readFileSync(bodyPath, 'utf-8');
    } else if (opts.body) {
      body = opts.body;
    }

    if (body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Make request
    const method = opts.method.toUpperCase();
    const timeout = parseInt(opts.timeout, 10);

    try {
      const result = await makeRequest(opts.url, method, headers, body, timeout);

      if (json) {
        printOutput(result, fmtOpts);
        return;
      }

      // Human-readable output
      const statusColor = result.statusCode < 300 ? green : result.statusCode < 400 ? yellow : (s: string) => `\x1b[31m${s}\x1b[0m`;
      console.log(`${bold(method)} ${opts.url}`);
      if (opts.from) console.log(`${dim('from:')} ${opts.from}`);
      console.log();
      console.log(`${statusColor(`${result.statusCode} ${result.statusText}`)}  ${dim(`${result.duration}ms`)}`);
      console.log();

      // Response headers
      console.log(dim('--- Headers ---'));
      for (const [k, v] of Object.entries(result.headers)) {
        console.log(`${dim(k)}: ${v}`);
      }
      console.log();

      // Response body
      console.log(dim('--- Body ---'));
      try {
        const parsed = JSON.parse(result.body);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(result.body);
      }
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err), fmtOpts);
      process.exit(2);
    }
  });

// ─── HTTP Request ──────────────────────────────────────────────

interface FetchResult {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

function makeRequest(
  urlStr: string,
  method: string,
  headers: Record<string, string>,
  body: string | null,
  timeout: number,
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const parsed = new URL(urlStr);
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method,
        headers,
        timeout,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const duration = Date.now() - start;
          const resBody = Buffer.concat(chunks).toString('utf-8');
          const resHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') resHeaders[k] = v;
            else if (Array.isArray(v)) resHeaders[k] = v.join(', ');
          }
          resolve({
            statusCode: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            headers: resHeaders,
            body: resBody,
            duration,
          });
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeout}ms`));
    });

    if (body) req.write(body);
    req.end();
  });
}

// ─── Env Token Resolution ──────────────────────────────────────

function resolveEnvToken(targetPath: string, key: string): string | null {
  const envFiles = ['.env', '.env.local', '.env.development', '.env.development.local'];

  for (const envFile of envFiles) {
    const fullPath = path.join(targetPath, envFile);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eqIdx = trimmed.indexOf('=');
      const k = trimmed.slice(0, eqIdx).trim();
      if (k !== key) continue;
      let v = trimmed.slice(eqIdx + 1).trim();
      // Strip quotes
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      // Strip inline comments
      const commentIdx = v.indexOf(' #');
      if (commentIdx > 0) v = v.slice(0, commentIdx).trim();
      return v;
    }
  }
  return null;
}
