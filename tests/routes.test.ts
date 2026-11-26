import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { SwrCache } from '../src/cache/sqlite-swr.js';
import { AnimeService } from '../src/services/anime-service.js';
import { ExtraService } from '../src/services/extra-service.js';
import { MalScraper } from '../src/upstream/mal-scraper.js';
import { MalWebClient } from '../src/upstream/mal-web-client.js';
import { RateLimitedQueue } from '../src/upstream/rate-queue.js';
import { DiscoveryScraper } from '../src/upstream/scrapers/discovery-scraper.js';
import { EntitiesScraper } from '../src/upstream/scrapers/entities-scraper.js';
import { SubresourcesScraper } from '../src/upstream/scrapers/subresources-scraper.js';

describe('OpenAPI & Route Registration', () => {
  it('registers all Jikan v4 endpoint groups in OpenAPI spec', async () => {
    const cache = new SwrCache({ dbPath: ':memory:', freshTtlMs: 60_000, staleTtlMs: 120_000 });
    const queue = new RateLimitedQueue(1, 0);
    const web = new MalWebClient(queue, 5000);
    const animeService = new AnimeService(cache, null, new MalScraper(queue, 5000));
    const extraService = new ExtraService(
      cache,
      animeService,
      new SubresourcesScraper(web),
      new DiscoveryScraper(web),
      new EntitiesScraper(web),
    );

    const app = createApp(animeService, extraService);
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);

    const spec = (await res.json()) as { paths: Record<string, unknown> };
    const paths = Object.keys(spec.paths);

    const expectedPaths = [
      '/v4/anime',
      '/v4/anime/{id}',
      '/v4/anime/{id}/full',
      '/v4/anime/{id}/episodes',
      '/v4/anime/{id}/themes',
      '/v4/anime/{id}/relations',
      '/v4/manga',
      '/v4/manga/{id}/full',
      '/v4/manga/{id}/relations',
      '/v4/top/anime',
      '/v4/top/manga',
      '/v4/top/characters',
      '/v4/top/people',
      '/v4/top/reviews',
      '/v4/seasons',
      '/v4/seasons/now',
      '/v4/seasons/upcoming',
      '/v4/schedules',
      '/v4/genres/anime',
      '/v4/genres/manga',
      '/v4/characters',
      '/v4/characters/{id}/full',
      '/v4/people',
      '/v4/people/{id}/voices',
      '/v4/producers',
      '/v4/magazines',
      '/v4/watch/episodes',
      '/v4/watch/promos',
      '/v4/random/{type}',
      '/v4/clubs',
      '/v4/clubs/{id}/staff',
      '/v4/clubs/{id}/relations',
      '/v4/users/userbyid/{id}',
      '/v4/users/{username}',
      '/v4/users/{username}/statistics',
      '/v4/users/{username}/favorites',
      '/v4/users/{username}/history',
      '/v4/news',
    ];

    for (const p of expectedPaths) {
      expect(paths).toContain(p);
    }

    cache.close();
  });
});
