import express from 'express';
import path from 'path';
import { parseDirectory } from '@omnigraph/parsers';

export function createServer(targetPath: string, port: number = 3000): void {
  const app = express();

  app.get('/api/graph', (_req, res) => {
    try {
      const graph = parseDirectory(targetPath);
      res.json(graph);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Serve the built UI
  const uiDistPath = path.resolve(__dirname, '../../ui/dist');
  app.use(express.static(uiDistPath));

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(uiDistPath, 'index.html'));
  });

  app.listen(port, () => {
    console.log(`OmniGraph running at http://localhost:${port}`);
    console.log(`Analyzing: ${targetPath}`);
  });
}
