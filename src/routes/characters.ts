import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ExtraService } from '../services/extra-service.js';
import { PaginationQuerySchema, sendServiceResult } from './response-helper.js';

const IdParam = z.object({
  id: z.coerce.number().int().positive().openapi({ param: { name: 'id', in: 'path' }, example: 1 }),
});

const SearchQuery = PaginationQuerySchema.extend({
  q: z.string().min(1).openapi({ param: { name: 'q', in: 'query' }, example: 'spike' }),
});

export function createCharacterRoutes(extra: ExtraService): OpenAPIHono {
  const app = new OpenAPIHono();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/characters',
      tags: ['Characters'],
      summary: 'Search characters',
      request: { query: SearchQuery },
      responses: { 200: { description: 'Paginated character list' } },
    }),
    async (c) => {
      const { q, page, limit } = c.req.valid('query');
      const res = await extra.cachedList(`chars:q:${q.toLowerCase()}:p${page}:l${limit}`, page, limit, () =>
        extra.entities.searchCharacters(q, page, limit),
      );
      return sendServiceResult(c, res);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/characters/{id}',
      tags: ['Characters'],
      summary: 'Get character by ID',
      request: { params: IdParam },
      responses: { 200: { description: 'Character details' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(c, await extra.cachedSingle(`char:${id}`, () => extra.entities.getCharacterById(id)));
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/characters/{id}/full',
      tags: ['Characters'],
      summary: 'Get full character details',
      request: { params: IdParam },
      responses: { 200: { description: 'Full character profile' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const res = await extra.cachedSingle(`char:${id}:full`, async () => {
        const [profile, anime, manga, voices] = await Promise.all([
          extra.entities.getCharacterById(id),
          extra.entities.getCharacterAppearances(id, 'anime'),
          extra.entities.getCharacterAppearances(id, 'manga'),
          extra.entities.getCharacterVoices(id),
        ]);
        return { ...profile, anime, manga, voices };
      });
      return sendServiceResult(c, res);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/characters/{id}/anime',
      tags: ['Characters'],
      summary: 'Get character animeography',
      request: { params: IdParam },
      responses: { 200: { description: 'Character anime appearances' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`char:${id}:anime`, () => extra.entities.getCharacterAppearances(id, 'anime')),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/characters/{id}/manga',
      tags: ['Characters'],
      summary: 'Get character mangaography',
      request: { params: IdParam },
      responses: { 200: { description: 'Character manga appearances' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`char:${id}:manga`, () => extra.entities.getCharacterAppearances(id, 'manga')),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/characters/{id}/voices',
      tags: ['Characters'],
      summary: 'Get character voice actors',
      request: { params: IdParam },
      responses: { 200: { description: 'Character voice actors' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`char:${id}:voices`, () => extra.entities.getCharacterVoices(id)),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/characters/{id}/pictures',
      tags: ['Characters'],
      summary: 'Get character pictures',
      request: { params: IdParam },
      responses: { 200: { description: 'Character pictures' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`char:${id}:pics`, () => extra.entities.getEntityPictures('character', id)),
      );
    },
  );

  return app;
}
