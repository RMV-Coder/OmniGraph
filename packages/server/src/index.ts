import express from 'express';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import path from 'path';
import { URL } from 'url';
import rateLimit from 'express-rate-limit';
import { parseDirectory } from '@omnigraph/parsers';

const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const staticRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Safe hostnames allowed for the proxy endpoint (SSRF prevention) */
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export function createServer(targetPath: string, port: number = 3000): void {
  const resolvedTarget = path.resolve(targetPath);
  const app = express();

  // Parse JSON bodies for the proxy endpoint
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/graph', apiRateLimit, (_req, res) => {
    try {
      const graph = parseDirectory(targetPath);
      res.json(graph);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /** Serve the raw content of a file inside the analyzed repo. */
  app.get('/api/file', apiRateLimit, (req, res) => {
    try {
      const filePath = req.query.path as string | undefined;
      if (!filePath) {
        res.status(400).json({ error: 'Missing "path" query parameter' });
        return;
      }

      // Resolve the requested path and ensure it's within the target directory
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(resolvedTarget)) {
        res.status(403).json({ error: 'Path is outside the analyzed directory' });
        return;
      }

      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      // Read file with a size limit (1MB) to prevent serving huge files
      const stats = fs.statSync(resolved);
      if (stats.size > 1024 * 1024) {
        res.status(413).json({ error: 'File too large (max 1MB)' });
        return;
      }

      const content = fs.readFileSync(resolved, 'utf-8');
      res.json({
        path: resolved,
        content,
        lines: content.split('\n').length,
        size: stats.size,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  /**
   * Proxy endpoint for the API debugger.
   * Forwards HTTP requests to localhost targets only (SSRF prevention).
   */
  app.post('/api/proxy', apiRateLimit, async (req, res) => {
    try {
      const { method, url, headers, queryParams, body } = req.body;

      if (!method || !url) {
        res.status(400).json({ error: 'Missing required fields: method, url' });
        return;
      }

      // Parse and validate the target URL
      let targetUrl: URL;
      try {
        targetUrl = new URL(url);
      } catch {
        // If no protocol, assume http://localhost
        try {
          targetUrl = new URL(`http://localhost:${port}${url.startsWith('/') ? url : '/' + url}`);
        } catch {
          res.status(400).json({ error: 'Invalid URL' });
          return;
        }
      }

      // SSRF prevention: only allow localhost targets
      if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
        res.status(403).json({
          error: `Proxy only allows requests to localhost. Got: ${targetUrl.hostname}`,
        });
        return;
      }

      // Append query params
      if (queryParams && typeof queryParams === 'object') {
        for (const [key, value] of Object.entries(queryParams)) {
          if (key && value) targetUrl.searchParams.set(key, String(value));
        }
      }

      // Build outbound request options
      const isHttps = targetUrl.protocol === 'https:';
      const transport = isHttps ? https : http;
      const outboundHeaders: Record<string, string> = {};

      if (headers && typeof headers === 'object') {
        for (const [key, value] of Object.entries(headers)) {
          if (key && value) outboundHeaders[key.toLowerCase()] = String(value);
        }
      }

      // Set content-type for requests with body
      if (body && !outboundHeaders['content-type']) {
        outboundHeaders['content-type'] = 'application/json';
      }

      const startTime = Date.now();

      const proxyResponse = await new Promise<{
        statusCode: number;
        statusText: string;
        headers: Record<string, string>;
        body: string;
        duration: number;
      }>((resolve, reject) => {
        const proxyReq = transport.request(
          targetUrl.toString(),
          {
            method: method.toUpperCase(),
            headers: outboundHeaders,
            timeout: 30000, // 30 second timeout
          },
          (proxyRes) => {
            const chunks: Buffer[] = [];
            let totalSize = 0;
            const MAX_BODY = 5 * 1024 * 1024; // 5MB limit

            proxyRes.on('data', (chunk: Buffer) => {
              totalSize += chunk.length;
              if (totalSize <= MAX_BODY) {
                chunks.push(chunk);
              }
            });

            proxyRes.on('end', () => {
              const duration = Date.now() - startTime;
              const responseBody = Buffer.concat(chunks).toString('utf-8');

              // Flatten response headers
              const responseHeaders: Record<string, string> = {};
              for (const [key, value] of Object.entries(proxyRes.headers)) {
                responseHeaders[key] = Array.isArray(value) ? value.join(', ') : (value ?? '');
              }

              resolve({
                statusCode: proxyRes.statusCode ?? 0,
                statusText: proxyRes.statusMessage ?? '',
                headers: responseHeaders,
                body: totalSize > MAX_BODY ? '[Response truncated — exceeds 5MB]' : responseBody,
                duration,
              });
            });

            proxyRes.on('error', reject);
          },
        );

        proxyReq.on('error', (err) => {
          reject(new Error(`Connection failed: ${err.message}`));
        });

        proxyReq.on('timeout', () => {
          proxyReq.destroy();
          reject(new Error('Request timed out (30s)'));
        });

        // Send the request body
        if (body) {
          proxyReq.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        proxyReq.end();
      });

      res.json(proxyResponse);
    } catch (err) {
      const duration = 0;
      res.status(502).json({
        statusCode: 0,
        statusText: 'Proxy Error',
        headers: {},
        body: String(err instanceof Error ? err.message : err),
        duration,
      });
    }
  });

  // Serve the built UI
  const uiDistPath = path.resolve(__dirname, '../../ui/dist');
  if (!fs.existsSync(uiDistPath)) {
    console.warn(`[OmniGraph] UI dist not found at ${uiDistPath}. Run: cd packages/ui && npm run build`);
  }
  app.use(express.static(uiDistPath));

  // SPA fallback
  app.get('*', staticRateLimit, (_req, res) => {
    res.sendFile(path.join(uiDistPath, 'index.html'));
  });

  app.listen(port, () => {
    console.log(`OmniGraph running at http://localhost:${port}`);
    console.log(`Analyzing: ${targetPath}`);
  });
}
