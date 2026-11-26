import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ExtraService } from '../services/extra-service.js';
import { PaginationQuerySchema, sendServiceResult } from './response-helper.js';

const IdParam = z.object({
  id: z.coerce.number().int().positive().openapi({ param: { name: 'id', in: 'path' }, example: 11 }),
});

const SearchQuery = PaginationQuerySchema.extend({
  q: z.string().min(1).openapi({ param: { name: 'q', in: 'query' }, example: 'yamadera' }),
});

export function createPeopleRoutes(extra: ExtraService): OpenAPIHono {
  const app = new OpenAPIHono();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/people',
      tags: ['People'],
      summary: 'Search people / voice actors / staff',
      request: { query: SearchQuery },
      responses: { 200: { description: 'Paginated people list' } },
    }),
    async (c) => {
      const { q, page, limit } = c.req.valid('query');
      const res = await extra.cachedList(`people:q:${q.toLowerCase()}:p${page}:l${limit}`, page, limit, () =>
        extra.entities.searchPeople(q, page, limit),
      );
      return sendServiceResult(c, res);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/people/{id}',
      tags: ['People'],
      summary: 'Get person by ID',
      request: { params: IdParam },
      responses: { 200: { description: 'Person details' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(c, await extra.cachedSingle(`person:${id}`, () => extra.entities.getPersonById(id)));
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/people/{id}/full',
      tags: ['People'],
      summary: 'Get full person details',
      request: { params: IdParam },
      responses: { 200: { description: 'Full person profile' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const res = await extra.cachedSingle(`person:${id}:full`, async () => {
        const [profile, anime, manga, voices] = await Promise.all([
          extra.entities.getPersonById(id),
          extra.entities.getPersonWorks(id, 'anime'),
          extra.entities.getPersonWorks(id, 'manga'),
          extra.entities.getPersonVoices(id),
        ]);
        return { ...profile, anime, manga, voices };
      });
      return sendServiceResult(c, res);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/people/{id}/anime',
      tags: ['People'],
      summary: 'Get person anime staff positions',
      request: { params: IdParam },
      responses: { 200: { description: 'Anime staff positions' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`person:${id}:anime`, () => extra.entities.getPersonWorks(id, 'anime')),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/people/{id}/voices',
      tags: ['People'],
      summary: 'Get person voice acting roles',
      request: { params: IdParam },
      responses: { 200: { description: 'Voice acting roles' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`person:${id}:voices`, () => extra.entities.getPersonVoices(id)),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/people/{id}/manga',
      tags: ['People'],
      summary: 'Get person manga works',
      request: { params: IdParam },
      responses: { 200: { description: 'Manga works' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`person:${id}:manga`, () => extra.entities.getPersonWorks(id, 'manga')),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/people/{id}/pictures',
      tags: ['People'],
      summary: 'Get person pictures',
      request: { params: IdParam },
      responses: { 200: { description: 'Person pictures' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`person:${id}:pics`, () => extra.entities.getEntityPictures('people', id)),
      );
    },
  );

  return app;
}
