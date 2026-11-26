import { Hono } from 'hono';
import type { AnimeService } from '../services/anime-service.js';

export function createSystemRoutes(service: AnimeService, startedAtMs: number): Hono {
  const app = new Hono();

  app.get('/health', (c) => {
    return c.json({
      status: 'ok',
      mode: service.mode,
      uptimeSeconds: Math.round((Date.now() - startedAtMs) / 1000),
    });
  });

  app.get('/api/stats', (c) => {
    return c.json({
      mode: service.mode,
      uptimeSeconds: Math.round((Date.now() - startedAtMs) / 1000),
      cache: service.getCacheStats(),
    });
  });

  app.post('/api/cache/clear', (c) => {
    service.clearCache();
    return c.json({ status: 'cleared' });
  });

  return app;
}
