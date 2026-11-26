import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AnimeService } from '../services/anime-service.js';
import type { ExtraService } from '../services/extra-service.js';
import { PaginationQuerySchema, sendServiceResult } from './response-helper.js';

const SeasonPaginationQuerySchema = PaginationQuerySchema;

const SeasonParamsSchema = z.object({
  year: z.coerce.number().int().min(1960).max(2100).openapi({
    param: { name: 'year', in: 'path' },
    example: 2024,
  }),
  season: z.enum(['winter', 'spring', 'summer', 'fall']).openapi({
    param: { name: 'season', in: 'path' },
    example: 'fall',
  }),
});

const getSeasonsNowRoute = createRoute({
  method: 'get',
  path: '/v4/seasons/now',
  tags: ['Seasons'],
  summary: 'Get current season anime',
  description: 'Returns anime airing in the current season.',
  request: { query: SeasonPaginationQuerySchema },
  responses: {
    200: { description: 'Current season anime list' },
  },
});

const getSeasonByYearRoute = createRoute({
  method: 'get',
  path: '/v4/seasons/{year}/{season}',
  tags: ['Seasons'],
  summary: 'Get anime by year and season',
  description: 'Returns anime for a specific year and season (winter, spring, summer, fall).',
  request: { params: SeasonParamsSchema, query: SeasonPaginationQuerySchema },
  responses: {
    200: { description: 'Seasonal anime list' },
  },
});

export function createSeasonRoutes(service: AnimeService, extra?: ExtraService): OpenAPIHono {
  const app = new OpenAPIHono();

  if (extra) {
    app.openapi(
      createRoute({
        method: 'get',
        path: '/v4/seasons',
        tags: ['Seasons'],
        summary: 'Get available seasons archive list',
        responses: { 200: { description: 'List of years and seasons' } },
      }),
      async (c) => sendServiceResult(c, await extra.cachedSingle('seasons:list', () => extra.discovery.getSeasonsList())),
    );

    app.openapi(
      createRoute({
        method: 'get',
        path: '/v4/seasons/upcoming',
        tags: ['Seasons'],
        summary: 'Get upcoming season anime',
        request: { query: SeasonPaginationQuerySchema },
        responses: { 200: { description: 'Upcoming anime list' } },
      }),
      async (c) => {
        const { page, limit } = c.req.valid('query');
        return sendServiceResult(
          c,
          await extra.cachedList(`seasons:upcoming:p${page}:l${limit}`, page, limit, () =>
            extra.discovery.getUpcomingSeason(),
          ),
        );
      },
    );
  }

  app.openapi(getSeasonsNowRoute, async (c) => {
    const { page, limit } = c.req.valid('query');
    const result = await service.getSeasonalAnime(undefined, undefined, page, limit);
    return sendServiceResult(c, result);
  });

  app.openapi(getSeasonByYearRoute, async (c) => {
    const { year, season } = c.req.valid('param');
    const { page, limit } = c.req.valid('query');
    const result = await service.getSeasonalAnime(year, season, page, limit);
    return sendServiceResult(c, result);
  });

  return app;
}
