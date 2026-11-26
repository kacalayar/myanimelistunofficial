import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ExtraService } from '../services/extra-service.js';
import { PaginationQuerySchema, sendServiceResult } from './response-helper.js';

const IdParam = z.object({
  id: z.coerce.number().int().positive().openapi({ param: { name: 'id', in: 'path' }, example: 11 }),
});

const OptionalSearchQuery = PaginationQuerySchema.extend({
  q: z.string().optional().openapi({ param: { name: 'q', in: 'query' }, example: 'madhouse' }),
});

export function createProducerRoutes(extra: ExtraService): OpenAPIHono {
  const app = new OpenAPIHono();

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/producers',
      tags: ['Producers'],
      summary: 'List or search anime studios & producers',
      request: { query: OptionalSearchQuery },
      responses: { 200: { description: 'Producers list' } },
    }),
    async (c) => {
      const { q, page, limit } = c.req.valid('query');
      const res = await extra.cachedList(`producers:q:${q ?? ''}:p${page}:l${limit}`, page, limit, () =>
        extra.entities.listProducers(q, limit),
      );
      return sendServiceResult(c, res);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/producers/{id}',
      tags: ['Producers'],
      summary: 'Get producer by ID',
      request: { params: IdParam },
      responses: { 200: { description: 'Producer details' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(c, await extra.cachedSingle(`producer:${id}`, () => extra.entities.getProducerById(id)));
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/producers/{id}/full',
      tags: ['Producers'],
      summary: 'Get full producer details',
      request: { params: IdParam },
      responses: { 200: { description: 'Full producer details' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(c, await extra.cachedSingle(`producer:${id}`, () => extra.entities.getProducerById(id)));
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/producers/{id}/external',
      tags: ['Producers'],
      summary: 'Get producer external links',
      request: { params: IdParam },
      responses: { 200: { description: 'External links' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const res = await extra.cachedSingle(`producer:${id}:ext`, async () => {
        const p = await extra.entities.getProducerById(id);
        return p.external;
      });
      return sendServiceResult(c, res);
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/magazines',
      tags: ['Magazines'],
      summary: 'List or search manga magazines',
      request: { query: OptionalSearchQuery },
      responses: { 200: { description: 'Magazines list' } },
    }),
    async (c) => {
      const { q, page, limit } = c.req.valid('query');
      const res = await extra.cachedList(`magazines:q:${q ?? ''}:p${page}:l${limit}`, page, limit, () =>
        extra.entities.listMagazines(q, limit),
      );
      return sendServiceResult(c, res);
    },
  );

  return app;
}
