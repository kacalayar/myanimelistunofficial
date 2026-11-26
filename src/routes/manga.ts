import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AnimeService } from '../services/anime-service.js';
import type { ExtraService } from '../services/extra-service.js';
import { PaginationQuerySchema, sendServiceResult } from './response-helper.js';

const MangaIdParamSchema = z.object({
  id: z.coerce.number().int().positive().openapi({
    param: { name: 'id', in: 'path' },
    example: 2,
    description: 'MyAnimeList Manga ID',
  }),
});

const BooleanStringSchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const MangaSearchQuerySchema = PaginationQuerySchema.extend({
  q: z.string().min(1).optional().openapi({
    param: { name: 'q', in: 'query' },
    example: 'berserk',
    description: 'Search query string (optional)',
  }),
  type: z
    .enum(['manga', 'novel', 'lightnovel', 'oneshot', 'doujin', 'manhwa', 'manhua'])
    .optional()
    .openapi({ param: { name: 'type', in: 'query' } }),
  status: z
    .enum(['publishing', 'complete', 'hiatus', 'discontinued', 'upcoming'])
    .optional()
    .openapi({ param: { name: 'status', in: 'query' } }),
  sfw: BooleanStringSchema.openapi({
    param: { name: 'sfw', in: 'query' },
    description: 'Filter out Adult entries when true',
  }),
  score: z.coerce.number().min(0).max(10).optional().openapi({ param: { name: 'score', in: 'query' } }),
  min_score: z.coerce.number().min(0).max(10).optional().openapi({ param: { name: 'min_score', in: 'query' } }),
  max_score: z.coerce.number().min(0).max(10).optional().openapi({ param: { name: 'max_score', in: 'query' } }),
  genres: z.string().optional().openapi({ param: { name: 'genres', in: 'query' } }),
  genres_exclude: z.string().optional().openapi({ param: { name: 'genres_exclude', in: 'query' } }),
  magazines: z.string().optional().openapi({ param: { name: 'magazines', in: 'query' } }),
  start_date: z.string().optional().openapi({ param: { name: 'start_date', in: 'query' } }),
  end_date: z.string().optional().openapi({ param: { name: 'end_date', in: 'query' } }),
  letter: z.string().max(1).optional().openapi({ param: { name: 'letter', in: 'query' } }),
  unapproved: BooleanStringSchema.openapi({ param: { name: 'unapproved', in: 'query' } }),
  order_by: z.string().optional().openapi({ param: { name: 'order_by', in: 'query' } }),
  sort: z.enum(['asc', 'desc']).optional().openapi({ param: { name: 'sort', in: 'query' } }),
});

const searchMangaRoute = createRoute({
  method: 'get',
  path: '/v4/manga',
  tags: ['Manga'],
  summary: 'Search manga',
  description: 'Search MyAnimeList manga by keyword (Jikan v4 compatible response).',
  request: { query: MangaSearchQuerySchema },
  responses: {
    200: { description: 'Paginated list of matching manga' },
  },
});

const getMangaByIdRoute = createRoute({
  method: 'get',
  path: '/v4/manga/{id}',
  tags: ['Manga'],
  summary: 'Get manga by MAL ID',
  description: 'Returns full manga metadata with SWR caching.',
  request: { params: MangaIdParamSchema },
  responses: {
    200: { description: 'Manga details' },
    404: { description: 'Manga not found' },
  },
});

const getMangaCharactersRoute = createRoute({
  method: 'get',
  path: '/v4/manga/{id}/characters',
  tags: ['Manga'],
  summary: 'Get manga characters',
  description: 'Returns characters list for a given manga ID.',
  request: { params: MangaIdParamSchema },
  responses: {
    200: { description: 'List of manga characters' },
    404: { description: 'Manga not found' },
  },
});

const getMangaNewsRoute = createRoute({
  method: 'get',
  path: '/v4/manga/{id}/news',
  tags: ['Manga'],
  summary: 'Get manga news',
  description: 'Returns recent news articles related to a given manga ID.',
  request: { params: MangaIdParamSchema },
  responses: {
    200: { description: 'List of manga news' },
    404: { description: 'Manga not found' },
  },
});

const getMangaRelationsRoute = createRoute({
  method: 'get',
  path: '/v4/manga/{id}/relations',
  tags: ['Manga'],
  summary: 'Get manga relations',
  description: 'Returns related manga and anime entries (sequels, prequels, adaptations, etc.).',
  request: { params: MangaIdParamSchema },
  responses: {
    200: { description: 'List of related entries grouped by relation type' },
    404: { description: 'Manga not found' },
  },
});

export function createMangaRoutes(service: AnimeService, extra?: ExtraService): OpenAPIHono {
  const app = new OpenAPIHono();

  app.openapi(searchMangaRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await service.searchManga(query);
    return sendServiceResult(c, result);
  });

  app.openapi(getMangaByIdRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.getMangaById(id);
    return sendServiceResult(c, result);
  });

  app.openapi(getMangaCharactersRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.getMangaCharacters(id);
    return sendServiceResult(c, result);
  });

  app.openapi(getMangaNewsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.getMangaNews(id);
    return sendServiceResult(c, result);
  });

  app.openapi(getMangaRelationsRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.getMangaRelations(id);
    return sendServiceResult(c, result);
  });

  if (extra) {
    app.openapi(
      createRoute({
        method: 'get',
        path: '/v4/manga/{id}/full',
        tags: ['Manga'],
        summary: 'Get full manga details',
        request: { params: MangaIdParamSchema },
        responses: { 200: { description: 'Full manga metadata' } },
      }),
      async (c) => sendServiceResult(c, await extra.getMangaFull(c.req.valid('param').id)),
    );

    const subRoutes: Array<{ suffix: string; summary: string; fn: (id: number) => Promise<unknown> }> = [
      { suffix: 'pictures', summary: 'Get manga pictures', fn: (id) => extra.subresources.getPictures('manga', id) },
      { suffix: 'statistics', summary: 'Get manga statistics', fn: (id) => extra.subresources.getStatistics('manga', id) },
      { suffix: 'recommendations', summary: 'Get manga recommendations', fn: (id) => extra.subresources.getRecommendations('manga', id) },
      { suffix: 'forum', summary: 'Get manga forum topics', fn: (id) => extra.subresources.getForum('manga', id) },
      { suffix: 'moreinfo', summary: 'Get manga more info', fn: (id) => extra.subresources.getMoreInfo('manga', id) },
      { suffix: 'external', summary: 'Get manga external links', fn: (id) => extra.subresources.getExternalLinks('manga', id) },
    ];

    for (const sub of subRoutes) {
      app.openapi(
        createRoute({
          method: 'get',
          path: `/v4/manga/{id}/${sub.suffix}`,
          tags: ['Manga'],
          summary: sub.summary,
          request: { params: MangaIdParamSchema },
          responses: { 200: { description: sub.summary } },
        }),
        async (c) => {
          const { id } = c.req.valid('param');
          return sendServiceResult(c, await extra.cachedSingle(`manga:${id}:${sub.suffix}`, () => sub.fn(id)));
        },
      );
    }
  }

  return app;
}
