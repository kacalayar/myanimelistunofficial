import { serveStatic } from '@hono/node-server/serve-static';
import { OpenAPIHono } from '@hono/zod-openapi';
import { apiReference } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import type { AnimeService } from './services/anime-service.js';
import type { ExtraService } from './services/extra-service.js';
import { UpstreamError } from './upstream/rate-queue.js';
import { createAnimeRoutes } from './routes/anime.js';
import { createCharacterRoutes } from './routes/characters.js';
import { createCommunityRoutes } from './routes/community.js';
import { createDiscoveryRoutes } from './routes/discovery.js';
import { createMangaRoutes } from './routes/manga.js';
import { createNewsRoutes } from './routes/news.js';
import { createPeopleRoutes } from './routes/people.js';
import { createProducerRoutes } from './routes/producers.js';
import { createSeasonRoutes } from './routes/seasons.js';
import { createSystemRoutes } from './routes/system.js';
import { createTopRoutes } from './routes/top.js';

export function createApp(service: AnimeService, extra?: ExtraService): OpenAPIHono {
  const startedAtMs = Date.now();
  const app = new OpenAPIHono();

  app.use('*', cors());

  app.use('*', async (c, next) => {
    const start = performance.now();
    await next();
    const durationMs = Math.round(performance.now() - start);
    c.header('X-Response-Time', `${durationMs}ms`);
  });

  app.onError((err, c) => {
    if (err instanceof UpstreamError) {
      const status = err.statusCode === 404 ? 404 : 502;
      return c.json(
        {
          status,
          type: 'UpstreamError',
          message: err.message,
        },
        status,
      );
    }

    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return c.json(
      {
        status: 500,
        type: 'InternalError',
        message,
      },
      500,
    );
  });

  app.route('/', createSystemRoutes(service, startedAtMs));
  app.route('/', createAnimeRoutes(service, extra));
  app.route('/', createMangaRoutes(service, extra));
  app.route('/', createNewsRoutes(service));
  app.route('/', createTopRoutes(service, extra));
  app.route('/', createSeasonRoutes(service, extra));
  if (extra) {
    app.route('/', createCharacterRoutes(extra));
    app.route('/', createPeopleRoutes(extra));
    app.route('/', createProducerRoutes(extra));
    app.route('/', createDiscoveryRoutes(extra));
    app.route('/', createCommunityRoutes(extra));
  }

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'MAL Unofficial API',
      version: '1.0.0',
      description:
        'Fast, timeout-resistant Unofficial MyAnimeList API (Jikan v4 compatible) powered by Hybrid MAL API v2 + Scraper, Singleflight, and SQLite SWR Cache.',
    },
  });

  app.get(
    '/docs',
    apiReference({
      spec: { url: '/openapi.json' },
      theme: 'purple',
    }),
  );

  app.use('/*', serveStatic({ root: './public' }));

  return app;
}
