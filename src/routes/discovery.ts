import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ExtraService } from '../services/extra-service.js';
import { PaginationQuerySchema, sendServiceResult } from './response-helper.js';

const ScheduleQuery = PaginationQuerySchema.extend({
  filter: z
    .enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
    .optional()
    .openapi({ param: { name: 'filter', in: 'query' }, example: 'monday' }),
  kids: z.enum(['true', 'false']).optional().openapi({ param: { name: 'kids', in: 'query' } }),
  sfw: z.enum(['true', 'false']).optional().openapi({ param: { name: 'sfw', in: 'query' } }),
  unapproved: z.enum(['true', 'false']).optional().openapi({ param: { name: 'unapproved', in: 'query' } }),
});

const GenreFilterQuery = z.object({
  filter: z
    .enum(['genres', 'explicit_genres', 'themes', 'demographics'])
    .optional()
    .openapi({ param: { name: 'filter', in: 'query' } }),
});

const RandomTypeParam = z.object({
  type: z.enum(['anime', 'manga', 'characters', 'people', 'users']).openapi({
    param: { name: 'type', in: 'path' },
    example: 'anime',
  }),
});

export function createDiscoveryRoutes(extra: ExtraService): OpenAPIHono {
  const app = new OpenAPIHono();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/schedules',
      tags: ['Schedules'],
      summary: 'Get airing schedule',
      request: { query: ScheduleQuery },
      responses: { 200: { description: 'Scheduled anime list' } },
    }),
    async (c) => {
      const { filter, sfw, kids, page, limit } = c.req.valid('query');
      const res = await extra.cachedList(
        `schedules:${filter ?? 'all'}:sfw:${sfw ?? ''}:kids:${kids ?? ''}:p${page}:l${limit}`,
        page,
        limit,
        async () => {
          const items = await extra.discovery.getSchedules(filter);
          if (sfw === 'true') {
            return items.filter((i) => !i.genres.some((g) => g.name === 'Hentai' || g.name === 'Erotica'));
          }
          return items;
        },
      );
      return sendServiceResult(c, res);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/genres/anime',
      tags: ['Genres'],
      summary: 'Get anime genres',
      request: { query: GenreFilterQuery },
      responses: { 200: { description: 'Anime genres list' } },
    }),
    async (c) => {
      const { filter } = c.req.valid('query');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`genres:anime:${filter ?? 'all'}`, () => extra.discovery.getGenres('anime')),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/genres/manga',
      tags: ['Genres'],
      summary: 'Get manga genres',
      request: { query: GenreFilterQuery },
      responses: { 200: { description: 'Manga genres list' } },
    }),
    async (c) => {
      const { filter } = c.req.valid('query');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`genres:manga:${filter ?? 'all'}`, () => extra.discovery.getGenres('manga')),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/reviews/anime',
      tags: ['Reviews'],
      summary: 'Get recent anime reviews',
      request: { query: PaginationQuerySchema },
      responses: { 200: { description: 'Recent anime reviews' } },
    }),
    async (c) => {
      const { page, limit } = c.req.valid('query');
      const res = await extra.cachedList(`reviews:anime:p${page}:l${limit}`, page, limit, () =>
        extra.discovery.getRecentReviews('anime', page),
      );
      return sendServiceResult(c, res);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/reviews/manga',
      tags: ['Reviews'],
      summary: 'Get recent manga reviews',
      request: { query: PaginationQuerySchema },
      responses: { 200: { description: 'Recent manga reviews' } },
    }),
    async (c) => {
      const { page, limit } = c.req.valid('query');
      const res = await extra.cachedList(`reviews:manga:p${page}:l${limit}`, page, limit, () =>
        extra.discovery.getRecentReviews('manga', page),
      );
      return sendServiceResult(c, res);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/recommendations/anime',
      tags: ['Recommendations'],
      summary: 'Get recent anime recommendations',
      request: { query: PaginationQuerySchema },
      responses: { 200: { description: 'Recent anime recommendations' } },
    }),
    async (c) => {
      const { page, limit } = c.req.valid('query');
      const res = await extra.cachedList(`recs:anime:p${page}:l${limit}`, page, limit, () =>
        extra.discovery.getRecentRecommendations('anime', page),
      );
      return sendServiceResult(c, res);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/recommendations/manga',
      tags: ['Recommendations'],
      summary: 'Get recent manga recommendations',
      request: { query: PaginationQuerySchema },
      responses: { 200: { description: 'Recent manga recommendations' } },
    }),
    async (c) => {
      const { page, limit } = c.req.valid('query');
      const res = await extra.cachedList(`recs:manga:p${page}:l${limit}`, page, limit, () =>
        extra.discovery.getRecentRecommendations('manga', page),
      );
      return sendServiceResult(c, res);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/watch/episodes',
      tags: ['Watch'],
      summary: 'Get recent watch episodes',
      responses: { 200: { description: 'Recent episodes' } },
    }),
    async (c) => {
      return sendServiceResult(
        c,
        await extra.cachedSingle('watch:episodes', () => extra.discovery.getWatchEpisodes(false)),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/watch/episodes/popular',
      tags: ['Watch'],
      summary: 'Get popular watch episodes',
      responses: { 200: { description: 'Popular episodes' } },
    }),
    async (c) => {
      return sendServiceResult(
        c,
        await extra.cachedSingle('watch:episodes:popular', () => extra.discovery.getWatchEpisodes(true)),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/watch/promos',
      tags: ['Watch'],
      summary: 'Get recent promotional videos',
      responses: { 200: { description: 'Recent promos' } },
    }),
    async (c) => {
      return sendServiceResult(c, await extra.cachedSingle('watch:promos', () => extra.discovery.getWatchPromos()));
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/random/{type}',
      tags: ['Random'],
      summary: 'Get random anime, manga, character, person, or user',
      request: { params: RandomTypeParam },
      responses: { 200: { description: 'Random resource' } },
    }),
    async (c) => {
      const { type } = c.req.valid('param');
      return sendServiceResult(c, await extra.getRandom(type));
    },
  );

  return app;
}
