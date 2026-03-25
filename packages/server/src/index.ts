import express from 'express';
import * as fs from 'fs';
import path from 'path';
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

export function createServer(targetPath: string, port: number = 3000): void {
  const resolvedTarget = path.resolve(targetPath);
  const app = express();

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
