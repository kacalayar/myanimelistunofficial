import { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import type { ServiceResult } from '../services/anime-service.js';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({
    param: { name: 'page', in: 'query' },
    example: 1,
  }),
  limit: z.coerce.number().int().min(1).max(50).default(25).openapi({
    param: { name: 'limit', in: 'query' },
    example: 25,
    description: 'Items per page (default 25, max 50)',
  }),
});

/**
 * Attaches cache observability headers and returns a JSON response.
 */
export function sendServiceResult<T>(c: Context, result: ServiceResult<T>): Response {
  c.header('X-Cache', result.cacheStatus);
  c.header('X-Cache-Age', String(Math.round(result.ageMs / 1000)));
  c.header('X-Upstream-Mode', result.upstreamMode);
  return c.json(result.payload, 200);
}
