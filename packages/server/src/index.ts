import express from 'express';
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
  const app = express();

  app.get('/api/graph', apiRateLimit, (_req, res) => {
    try {
      const graph = parseDirectory(targetPath);
      res.json(graph);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Serve the built UI
  const uiDistPath = path.resolve(__dirname, '../../ui/dist');
  if (!require('fs').existsSync(uiDistPath)) {
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
