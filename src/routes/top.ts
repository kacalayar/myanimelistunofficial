import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AnimeService } from '../services/anime-service.js';
import type { ExtraService } from '../services/extra-service.js';
import { PaginationQuerySchema, sendServiceResult } from './response-helper.js';

const TopQuerySchema = PaginationQuerySchema.extend({
  type: z
    .enum(['tv', 'movie', 'ova', 'special', 'ona', 'music', 'cm', 'pv', 'tv_special'])
    .optional()
    .openapi({ param: { name: 'type', in: 'query' }, description: 'Anime type filter' }),
  filter: z
    .enum([
      'all',
      'airing',
      'upcoming',
      'tv',
      'movie',
      'ova',
      'ona',
      'special',
      'bypopularity',
      'favorite',
    ])
    .default('all')
    .openapi({
      param: { name: 'filter', in: 'query' },
      example: 'airing',
      description: 'Ranking filter type',
    }),
});

const getTopAnimeRoute = createRoute({
  method: 'get',
  path: '/v4/top/anime',
  tags: ['Top'],
  summary: 'Get top ranked anime',
  description: 'Returns top ranked anime from MyAnimeList (Jikan v4 compatible).',
  request: { query: TopQuerySchema },
  responses: {
    200: { description: 'Paginated top anime list' },
  },
});

const TopMangaQuerySchema = PaginationQuerySchema.extend({
  type: z
    .enum(['manga', 'novel', 'lightnovel', 'oneshot', 'doujin', 'manhwa', 'manhua'])
    .optional()
    .openapi({ param: { name: 'type', in: 'query' }, description: 'Manga type filter' }),
  filter: z
    .enum([
      'all',
      'manga',
      'novels',
      'lightnovels',
      'oneshots',
      'doujin',
      'manhwa',
      'manhua',
      'bypopularity',
      'favorite',
    ])
    .default('all')
    .openapi({
      param: { name: 'filter', in: 'query' },
      example: 'manga',
      description: 'Manga ranking filter type',
    }),
});

const getTopMangaRoute = createRoute({
  method: 'get',
  path: '/v4/top/manga',
  tags: ['Top'],
  summary: 'Get top ranked manga',
  description: 'Returns top ranked manga from MyAnimeList (Jikan v4 compatible).',
  request: { query: TopMangaQuerySchema },
  responses: {
    200: { description: 'Paginated top manga list' },
  },
});

export function createTopRoutes(service: AnimeService, extra?: ExtraService): OpenAPIHono {
  const app = new OpenAPIHono();

  app.openapi(getTopAnimeRoute, async (c) => {
    const { type, filter, page, limit } = c.req.valid('query');
    const effectiveFilter = filter === 'all' && type ? type : filter;
    const result = await service.getTopAnime(effectiveFilter, page, limit);
    return sendServiceResult(c, result);
  });

  app.openapi(getTopMangaRoute, async (c) => {
    const { type, filter, page, limit } = c.req.valid('query');
    const typeToFilter: Record<string, string> = {
      novel: 'novels',
      lightnovel: 'lightnovels',
      oneshot: 'oneshots',
    };
    const effectiveFilter = filter === 'all' && type ? (typeToFilter[type] ?? type) : filter;
    const result = await service.getTopManga(effectiveFilter, page, limit);
    return sendServiceResult(c, result);
  });

  if (extra) {
    app.openapi(
      createRoute({
        method: 'get',
        path: '/v4/top/reviews',
        tags: ['Top'],
        summary: 'Get top/recent reviews',
        request: {
          query: PaginationQuerySchema.extend({
            type: z.enum(['anime', 'manga']).default('anime').openapi({ param: { name: 'type', in: 'query' } }),
          }),
        },
        responses: { 200: { description: 'Top reviews' } },
      }),
      async (c) => {
        const { type, page, limit } = c.req.valid('query');
        return sendServiceResult(
          c,
          await extra.cachedList(`top:reviews:${type}:p${page}:l${limit}`, page, limit, () =>
            extra.discovery.getRecentReviews(type, page),
          ),
        );
      },
    );
    app.openapi(
      createRoute({
        method: 'get',
        path: '/v4/top/characters',
        tags: ['Top'],
        summary: 'Get top characters',
        request: { query: PaginationQuerySchema },
        responses: { 200: { description: 'Top characters' } },
      }),
      async (c) => {
        const { page, limit } = c.req.valid('query');
        return sendServiceResult(
          c,
          await extra.cachedList(`top:characters:p${page}:l${limit}`, page, limit, () =>
            extra.discovery.getTopCharacters(page, limit),
          ),
        );
      },
    );

    app.openapi(
      createRoute({
        method: 'get',
        path: '/v4/top/people',
        tags: ['Top'],
        summary: 'Get top people',
        request: { query: PaginationQuerySchema },
        responses: { 200: { description: 'Top people' } },
      }),
      async (c) => {
        const { page, limit } = c.req.valid('query');
        return sendServiceResult(
          c,
          await extra.cachedList(`top:people:p${page}:l${limit}`, page, limit, () =>
            extra.discovery.getTopPeople(page, limit),
          ),
        );
      },
    );
  }

  return app;
}
