import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { initDatabase, startDailyBackupScheduler } from './server/db.ts';
import { createApiRouter } from './server/routes.ts';

async function startServer(): Promise<void> {
  initDatabase();
  startDailyBackupScheduler();

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', createApiRouter());

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`CRM Sklad listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
