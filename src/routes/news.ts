import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { AnimeService } from '../services/anime-service.js';
import { PaginationQuerySchema, sendServiceResult } from './response-helper.js';

const NewsQuerySchema = PaginationQuerySchema;

const getGlobalNewsRoute = createRoute({
  method: 'get',
  path: '/v4/news',
  tags: ['News'],
  summary: 'Get latest MyAnimeList news',
  description: 'Returns latest global anime & manga news from MyAnimeList.',
  request: { query: NewsQuerySchema },
  responses: {
    200: { description: 'Paginated list of latest news' },
  },
});

export function createNewsRoutes(service: AnimeService): OpenAPIHono {
  const app = new OpenAPIHono();

  app.openapi(getGlobalNewsRoute, async (c) => {
    const { page, limit } = c.req.valid('query');
    const result = await service.getGlobalNews(page, limit);
    return sendServiceResult(c, result);
  });

  return app;
}
