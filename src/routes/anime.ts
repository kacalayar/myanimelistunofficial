import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AnimeService } from '../services/anime-service.js';
import type { ExtraService } from '../services/extra-service.js';
import { PaginationQuerySchema, sendServiceResult } from './response-helper.js';

const AnimeIdParamSchema = z.object({
  id: z.coerce.number().int().positive().openapi({
    param: { name: 'id', in: 'path' },
    example: 1,
    description: 'MyAnimeList Anime ID',
  }),
});

const BooleanStringSchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const SearchQuerySchema = PaginationQuerySchema.extend({
  q: z.string().min(1).optional().openapi({
    param: { name: 'q', in: 'query' },
    example: 'frieren',
    description: 'Search query string (optional)',
  }),
  type: z
    .enum(['tv', 'movie', 'ova', 'special', 'ona', 'music', 'cm', 'pv', 'tv_special'])
    .optional()
    .openapi({ param: { name: 'type', in: 'query' } }),
  status: z
    .enum(['airing', 'complete', 'upcoming'])
    .optional()
    .openapi({ param: { name: 'status', in: 'query' } }),
  rating: z
    .enum(['g', 'pg', 'pg13', 'r17', 'r', 'rx'])
    .optional()
    .openapi({
      param: { name: 'rating', in: 'query' },
      description: 'Audience rating: g, pg, pg13, r17, r, rx',
    }),
  sfw: BooleanStringSchema.openapi({
    param: { name: 'sfw', in: 'query' },
    description: 'Filter out Adult (Rx/Hentai) entries when true',
  }),
  score: z.coerce.number().min(0).max(10).optional().openapi({ param: { name: 'score', in: 'query' } }),
  min_score: z.coerce.number().min(0).max(10).optional().openapi({ param: { name: 'min_score', in: 'query' } }),
  max_score: z.coerce.number().min(0).max(10).optional().openapi({ param: { name: 'max_score', in: 'query' } }),
  genres: z.string().optional().openapi({ param: { name: 'genres', in: 'query' } }),
  genres_exclude: z.string().optional().openapi({ param: { name: 'genres_exclude', in: 'query' } }),
  producers: z.string().optional().openapi({ param: { name: 'producers', in: 'query' } }),
  start_date: z.string().optional().openapi({ param: { name: 'start_date', in: 'query' } }),
  end_date: z.string().optional().openapi({ param: { name: 'end_date', in: 'query' } }),
  letter: z.string().max(1).optional().openapi({ param: { name: 'letter', in: 'query' } }),
  unapproved: BooleanStringSchema.openapi({ param: { name: 'unapproved', in: 'query' } }),
  order_by: z.string().optional().openapi({ param: { name: 'order_by', in: 'query' } }),
  sort: z.enum(['asc', 'desc']).optional().openapi({ param: { name: 'sort', in: 'query' } }),
});

const searchAnimeRoute = createRoute({
  method: 'get',
  path: '/v4/anime',
  tags: ['Anime'],
  summary: 'Search anime',
  description: 'Search MyAnimeList anime by keyword (Jikan v4 compatible response).',
  request: { query: SearchQuerySchema },
  responses: {
    200: { description: 'Paginated list of matching anime' },
  },
});

const getAnimeByIdRoute = createRoute({
  method: 'get',
  path: '/v4/anime/{id}',
  tags: ['Anime'],
  summary: 'Get anime by MAL ID',
  description: 'Returns full anime metadata with SWR caching.',
  request: { params: AnimeIdParamSchema },
  responses: {
    200: { description: 'Anime details' },
    404: { description: 'Anime not found' },
  },
});

const getAnimeCharactersRoute = createRoute({
  method: 'get',
  path: '/v4/anime/{id}/characters',
  tags: ['Anime'],
  summary: 'Get anime characters and voice actors',
  description: 'Returns characters and seiyuu list for a given anime ID.',
  request: { params: AnimeIdParamSchema },
  responses: {
    200: { description: 'List of characters and voice actors' },
    404: { description: 'Anime not found' },
  },
});

const getAnimeNewsRoute = createRoute({
  method: 'get',
  path: '/v4/anime/{id}/news',
  tags: ['Anime'],
  summary: 'Get anime news',
  description: 'Returns recent news articles related to a given anime ID.',
  request: { params: AnimeIdParamSchema },
  responses: {
    200: { description: 'List of anime news' },
    404: { description: 'Anime not found' },
  },
});

const getAnimeRelationsRoute = createRoute({
  method: 'get',
  path: '/v4/anime/{id}/relations',
  tags: ['Anime'],
  summary: 'Get anime relations',
  description: 'Returns related anime and manga entries (sequels, prequels, adaptations, etc.).',
  request: { params: AnimeIdParamSchema },
  responses: {
    200: { description: 'List of related entries grouped by relation type' },
    404: { description: 'Anime not found' },
  },
});

export function createAnimeRoutes(service: AnimeService, extra?: ExtraService): OpenAPIHono {
  const app = new OpenAPIHono();

  app.openapi(searchAnimeRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await service.searchAnime(query);
    return sendServiceResult(c, result);
  });

  app.openapi(getAnimeByIdRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.getAnimeById(id);
    return sendServiceResult(c, result);
  });

  app.openapi(getAnimeCharactersRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.getAnimeCharacters(id);
    return sendServiceResult(c, result);
  });

  app.openapi(getAnimeNewsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.getAnimeNews(id);
    return sendServiceResult(c, result);
  });

  app.openapi(getAnimeRelationsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.getAnimeRelations(id);
    return sendServiceResult(c, result);
  });

  if (extra) {
    app.openapi(
      createRoute({
        method: 'get',
        path: '/v4/anime/{id}/full',
        tags: ['Anime'],
        summary: 'Get full anime details',
        request: { params: AnimeIdParamSchema },
        responses: { 200: { description: 'Full anime metadata' } },
      }),
      async (c) => sendServiceResult(c, await extra.getAnimeFull(c.req.valid('param').id)),
    );

    const subRoutes: Array<{ suffix: string; summary: string; fn: (id: number) => Promise<unknown> }> = [
      { suffix: 'staff', summary: 'Get anime staff', fn: (id) => extra.subresources.getAnimeStaff(id) },
      { suffix: 'themes', summary: 'Get anime OP/ED themes', fn: (id) => extra.subresources.getAnimeThemes(id) },
      { suffix: 'videos', summary: 'Get anime videos', fn: (id) => extra.subresources.getAnimeVideos(id) },
      { suffix: 'pictures', summary: 'Get anime pictures', fn: (id) => extra.subresources.getPictures('anime', id) },
      { suffix: 'statistics', summary: 'Get anime statistics', fn: (id) => extra.subresources.getStatistics('anime', id) },
      { suffix: 'recommendations', summary: 'Get anime recommendations', fn: (id) => extra.subresources.getRecommendations('anime', id) },
      { suffix: 'forum', summary: 'Get anime forum topics', fn: (id) => extra.subresources.getForum('anime', id) },
      { suffix: 'moreinfo', summary: 'Get anime more info', fn: (id) => extra.subresources.getMoreInfo('anime', id) },
      { suffix: 'external', summary: 'Get anime external links', fn: (id) => extra.subresources.getExternalLinks('anime', id) },
      { suffix: 'streaming', summary: 'Get anime streaming links', fn: (id) => extra.subresources.getStreamingLinks(id) },
    ];

    for (const sub of subRoutes) {
      app.openapi(
        createRoute({
          method: 'get',
          path: `/v4/anime/{id}/${sub.suffix}`,
          tags: ['Anime'],
          summary: sub.summary,
          request: { params: AnimeIdParamSchema },
          responses: { 200: { description: sub.summary } },
        }),
        async (c) => {
          const { id } = c.req.valid('param');
          return sendServiceResult(c, await extra.cachedSingle(`anime:${id}:${sub.suffix}`, () => sub.fn(id)));
        },
      );
    }

    app.openapi(
      createRoute({
        method: 'get',
        path: '/v4/anime/{id}/episodes',
        tags: ['Anime'],
        summary: 'Get anime episodes',
        request: { params: AnimeIdParamSchema, query: PaginationQuerySchema },
        responses: { 200: { description: 'Paginated episodes list' } },
      }),
      async (c) => {
        const { id } = c.req.valid('param');
        const { page, limit } = c.req.valid('query');
        return sendServiceResult(
          c,
          await extra.cachedList(`anime:${id}:episodes:p${page}:l${limit}`, page, limit, () =>
            extra.subresources.getAnimeEpisodes(id, page),
          ),
        );
      },
    );

    app.openapi(
      createRoute({
        method: 'get',
        path: '/v4/anime/{id}/episodes/{episode}',
        tags: ['Anime'],
        summary: 'Get anime episode by number',
        request: {
          params: AnimeIdParamSchema.extend({
            episode: z.coerce.number().int().positive().openapi({ param: { name: 'episode', in: 'path' }, example: 1 }),
          }),
        },
        responses: { 200: { description: 'Episode details' } },
      }),
      async (c) => {
        const { id, episode } = c.req.valid('param');
        return sendServiceResult(
          c,
          await extra.cachedSingle(`anime:${id}:ep:${episode}`, () =>
            extra.subresources.getAnimeEpisodeById(id, episode),
          ),
        );
      },
    );
  }

  return app;
}
