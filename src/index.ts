import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { SwrCache } from './cache/sqlite-swr.js';
import { config } from './config/env.js';
import { AnimeService } from './services/anime-service.js';
import { ExtraService } from './services/extra-service.js';
import { MalApiClient } from './upstream/mal-api.js';
import { MalScraper } from './upstream/mal-scraper.js';
import { MalWebClient } from './upstream/mal-web-client.js';
import { DiscoveryScraper } from './upstream/scrapers/discovery-scraper.js';
import { EntitiesScraper } from './upstream/scrapers/entities-scraper.js';
import { SubresourcesScraper } from './upstream/scrapers/subresources-scraper.js';
import { RateLimitedQueue } from './upstream/rate-queue.js';

const cache = new SwrCache({
  dbPath: config.cacheDbPath,
  freshTtlMs: config.cacheFreshTtlMs,
  staleTtlMs: config.cacheStaleTtlMs,
});

const queue = new RateLimitedQueue(config.upstreamConcurrency, config.upstreamMinIntervalMs);
const malApi = config.malClientId
  ? new MalApiClient(config.malClientId, queue, config.upstreamTimeoutMs)
  : null;
const scraper = new MalScraper(queue, config.upstreamTimeoutMs);
const webClient = new MalWebClient(queue, config.upstreamTimeoutMs);

const service = new AnimeService(cache, malApi, scraper);
const extraService = new ExtraService(
  cache,
  service,
  new SubresourcesScraper(webClient),
  new DiscoveryScraper(webClient),
  new EntitiesScraper(webClient),
);
const app = createApp(service, extraService);

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    console.log(`MAL Unofficial API running at http://localhost:${info.port}`);
    console.log(`Dashboard UI : http://localhost:${info.port}/`);
    console.log(`OpenAPI Docs : http://localhost:${info.port}/docs`);
    console.log(`Upstream Mode: ${service.mode.toUpperCase()}`);
  },
);

function shutdown() {
  server.close(() => {
    cache.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
