import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { ExtraService } from '../services/extra-service.js';
import { PaginationQuerySchema, sendServiceResult } from './response-helper.js';

const ClubIdParam = z.object({
  id: z.coerce.number().int().positive().openapi({ param: { name: 'id', in: 'path' }, example: 1 }),
});

const UsernameParam = z.object({
  username: z.string().min(1).openapi({ param: { name: 'username', in: 'path' }, example: 'Xinil' }),
});

const OptionalQuery = PaginationQuerySchema.extend({
  q: z.string().optional().openapi({ param: { name: 'q', in: 'query' } }),
});

const UserSearchQuery = PaginationQuerySchema.extend({
  q: z.string().min(1).openapi({ param: { name: 'q', in: 'query' }, example: 'Xinil' }),
});

export function createCommunityRoutes(extra: ExtraService): OpenAPIHono {
  const app = new OpenAPIHono();

  // Clubs
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/clubs',
      tags: ['Clubs'],
      summary: 'List or search clubs',
      request: { query: OptionalQuery },
      responses: { 200: { description: 'Clubs list' } },
    }),
    async (c) => {
      const { q, page, limit } = c.req.valid('query');
      return sendServiceResult(
        c,
        await extra.cachedList(`clubs:q:${q ?? ''}:p${page}:l${limit}`, page, limit, () =>
          extra.entities.searchClubs(q, page, limit),
        ),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/clubs/{id}',
      tags: ['Clubs'],
      summary: 'Get club by ID',
      request: { params: ClubIdParam },
      responses: { 200: { description: 'Club details' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(c, await extra.cachedSingle(`club:${id}`, () => extra.entities.getClubById(id)));
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/clubs/{id}/members',
      tags: ['Clubs'],
      summary: 'Get club members',
      request: { params: ClubIdParam, query: PaginationQuerySchema },
      responses: { 200: { description: 'Club members' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const { page, limit } = c.req.valid('query');
      return sendServiceResult(
        c,
        await extra.cachedList(`club:${id}:members:p${page}:l${limit}`, page, limit, () =>
          extra.entities.getClubMembers(id, page),
        ),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/clubs/{id}/staff',
      tags: ['Clubs'],
      summary: 'Get club staff',
      request: { params: ClubIdParam },
      responses: { 200: { description: 'Club staff' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(c, await extra.cachedSingle(`club:${id}:staff`, () => extra.entities.getClubStaff(id)));
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/clubs/{id}/relations',
      tags: ['Clubs'],
      summary: 'Get club relations',
      request: { params: ClubIdParam },
      responses: { 200: { description: 'Club relations' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`club:${id}:relations`, () => extra.entities.getClubRelations(id)),
      );
    },
  );

  // Users
  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/users',
      tags: ['Users'],
      summary: 'Search MyAnimeList users',
      request: { query: UserSearchQuery },
      responses: { 200: { description: 'Users list' } },
    }),
    async (c) => {
      const { q, page, limit } = c.req.valid('query');
      return sendServiceResult(
        c,
        await extra.cachedList(`users:q:${q.toLowerCase()}:p${page}:l${limit}`, page, limit, () =>
          extra.entities.searchUsers(q, page, limit),
        ),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/users/{username}',
      tags: ['Users'],
      summary: 'Get user profile',
      request: { params: UsernameParam },
      responses: { 200: { description: 'User profile' } },
    }),
    async (c) => {
      const { username } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`user:${username.toLowerCase()}`, () => extra.entities.getUserProfile(username)),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/users/{username}/full',
      tags: ['Users'],
      summary: 'Get full user profile',
      request: { params: UsernameParam },
      responses: { 200: { description: 'Full user profile' } },
    }),
    async (c) => {
      const { username } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`user:${username.toLowerCase()}:full`, () => extra.entities.getUserProfile(username)),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/users/{username}/about',
      tags: ['Users'],
      summary: 'Get user bio/about',
      request: { params: UsernameParam },
      responses: { 200: { description: 'User about text' } },
    }),
    async (c) => {
      const { username } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`user:${username.toLowerCase()}:about`, async () => {
          const p = await extra.entities.getUserProfile(username);
          return { about: p.about };
        }),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/users/{username}/friends',
      tags: ['Users'],
      summary: 'Get user friends',
      request: { params: UsernameParam, query: PaginationQuerySchema },
      responses: { 200: { description: 'User friends list' } },
    }),
    async (c) => {
      const { username } = c.req.valid('param');
      const { page, limit } = c.req.valid('query');
      return sendServiceResult(
        c,
        await extra.cachedList(`user:${username.toLowerCase()}:friends:p${page}:l${limit}`, page, limit, () =>
          extra.entities.getUserFriends(username, page),
        ),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/users/{username}/animelist',
      tags: ['Users'],
      summary: 'Get user anime list',
      request: { params: UsernameParam },
      responses: { 200: { description: 'User anime list' } },
    }),
    async (c) => {
      const { username } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`user:${username.toLowerCase()}:animelist`, () =>
          extra.entities.getUserList(username, 'anime'),
        ),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/users/{username}/mangalist',
      tags: ['Users'],
      summary: 'Get user manga list',
      request: { params: UsernameParam },
      responses: { 200: { description: 'User manga list' } },
    }),
    async (c) => {
      const { username } = c.req.valid('param');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`user:${username.toLowerCase()}:mangalist`, () =>
          extra.entities.getUserList(username, 'manga'),
        ),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/users/userbyid/{id}',
      tags: ['Users'],
      summary: 'Get user by MAL ID',
      request: { params: ClubIdParam },
      responses: { 200: { description: 'User summary' } },
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      return sendServiceResult(c, await extra.cachedSingle(`user:id:${id}`, () => extra.entities.getUserById(id)));
    },
  );

  const userSingleSubs: Array<{ suffix: string; summary: string; fn: (u: string) => Promise<unknown> }> = [
    { suffix: 'statistics', summary: 'Get user statistics', fn: (u) => extra.entities.getUserStatistics(u) },
    { suffix: 'favorites', summary: 'Get user favorites', fn: (u) => extra.entities.getUserFavorites(u) },
    { suffix: 'userupdates', summary: 'Get user recent updates', fn: (u) => extra.entities.getUserUpdates(u) },
    { suffix: 'clubs', summary: 'Get user clubs', fn: (u) => extra.entities.getUserClubs(u) },
  ];

  for (const sub of userSingleSubs) {
    app.openapi(
      createRoute({
        method: 'get',
        path: `/v4/users/{username}/${sub.suffix}`,
        tags: ['Users'],
        summary: sub.summary,
        request: { params: UsernameParam },
        responses: { 200: { description: sub.summary } },
      }),
      async (c) => {
        const { username } = c.req.valid('param');
        return sendServiceResult(
          c,
          await extra.cachedSingle(`user:${username.toLowerCase()}:${sub.suffix}`, () => sub.fn(username)),
        );
      },
    );
  }

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/users/{username}/history',
      tags: ['Users'],
      summary: 'Get user watch/read history',
      request: {
        params: UsernameParam,
        query: z.object({ type: z.enum(['anime', 'manga']).optional() }),
      },
      responses: { 200: { description: 'User history' } },
    }),
    async (c) => {
      const { username } = c.req.valid('param');
      const { type } = c.req.valid('query');
      return sendServiceResult(
        c,
        await extra.cachedSingle(`user:${username.toLowerCase()}:history:${type ?? 'all'}`, () =>
          extra.entities.getUserHistory(username, type),
        ),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/users/{username}/reviews',
      tags: ['Users'],
      summary: 'Get user reviews',
      request: { params: UsernameParam, query: PaginationQuerySchema },
      responses: { 200: { description: 'User reviews' } },
    }),
    async (c) => {
      const { username } = c.req.valid('param');
      const { page, limit } = c.req.valid('query');
      return sendServiceResult(
        c,
        await extra.cachedList(`user:${username.toLowerCase()}:reviews:p${page}:l${limit}`, page, limit, () =>
          extra.entities.getUserReviews(username, page),
        ),
      );
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/v4/users/{username}/recommendations',
      tags: ['Users'],
      summary: 'Get user recommendations',
      request: { params: UsernameParam, query: PaginationQuerySchema },
      responses: { 200: { description: 'User recommendations' } },
    }),
    async (c) => {
      const { username } = c.req.valid('param');
      const { page, limit } = c.req.valid('query');
      return sendServiceResult(
        c,
        await extra.cachedList(`user:${username.toLowerCase()}:recs:p${page}:l${limit}`, page, limit, () =>
          extra.entities.getUserRecommendations(username, page),
        ),
      );
    },
  );

  return app;
}
