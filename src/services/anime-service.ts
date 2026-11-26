import type { CacheStatus, CacheStats, SwrCache } from '../cache/sqlite-swr.js';
import {
  buildPagination,
  mapMalApiAnimeToJikan,
  mapMalApiMangaToJikan,
  mapMalApiRelationsToJikan,
} from '../mappers/jikan-v4.js';
import type {
  JikanAnime,
  JikanCharacterEntry,
  JikanListResponse,
  JikanManga,
  JikanNewsItem,
  JikanRelationEntry,
  JikanSingleResponse,
} from '../types/jikan.js';
import {
  filterAnimeItems,
  filterMangaItems,
  sortMediaItems,
  type AnimeSearchFilters,
  type MangaSearchFilters,
} from '../types/search.js';
import type { MalApiClient } from '../upstream/mal-api.js';
import type { MalScraper } from '../upstream/mal-scraper.js';

const SHORT_TTL_MS = 60 * 60 * 1000; // 1 hour for lists (top / seasonal / search)

export interface ServiceResult<T> {
  payload: T;
  cacheStatus: CacheStatus;
  ageMs: number;
  upstreamMode: 'hybrid' | 'scraper';
}

function getCurrentSeason(): { year: number; season: string } {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  if (month >= 1 && month <= 3) return { year, season: 'winter' };
  if (month >= 4 && month <= 6) return { year, season: 'spring' };
  if (month >= 7 && month <= 9) return { year, season: 'summer' };
  return { year, season: 'fall' };
}

/**
 * Coordinates Hybrid data fetching (MAL API v2 + Cheerio Scraper fallback)
 * backed by the persistent SQLite SWR cache.
 */
export class AnimeService {
  constructor(
    private readonly cache: SwrCache,
    private readonly malApi: MalApiClient | null,
    private readonly scraper: MalScraper,
  ) {}

  get mode(): 'hybrid' | 'scraper' {
    return this.malApi ? 'hybrid' : 'scraper';
  }

  getCacheStats(): CacheStats {
    return this.cache.getStats();
  }

  clearCache(): void {
    this.cache.clear();
  }

  async getAnimeById(id: number): Promise<ServiceResult<JikanSingleResponse<JikanAnime>>> {
    const key = `anime:${id}`;
    const result = await this.cache.getOrFetch<JikanSingleResponse<JikanAnime>>(key, async () => {
      if (this.malApi) {
        const node = await this.malApi.getAnimeById(id);
        return { data: mapMalApiAnimeToJikan(node) };
      }
      const scraped = await this.scraper.getAnimeById(id);
      return { data: scraped };
    });

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async getAnimeCharacters(
    id: number,
  ): Promise<ServiceResult<JikanSingleResponse<JikanCharacterEntry[]>>> {
    const key = `anime:${id}:characters`;
    const result = await this.cache.getOrFetch<JikanSingleResponse<JikanCharacterEntry[]>>(
      key,
      async () => {
        const characters = await this.scraper.getAnimeCharacters(id);
        return { data: characters };
      },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async searchAnime(filters: AnimeSearchFilters): Promise<ServiceResult<JikanListResponse<JikanAnime>>> {
    const key = `search:${JSON.stringify(filters)}`;
    const { page, limit } = filters;
    const offset = (page - 1) * limit;
    const includeNsfw = filters.sfw === false || filters.rating === 'rx';

    const result = await this.cache.getOrFetch<JikanListResponse<JikanAnime>>(
      key,
      async () => {
        if (this.malApi) {
          const fallbackRanking =
            filters.status === 'upcoming' || filters.status === 'airing'
              ? filters.status
              : 'bypopularity';
          const res = filters.q
            ? await this.malApi.searchAnime(filters.q, limit, offset, includeNsfw)
            : await this.malApi.getTopAnime(fallbackRanking, limit, offset);
          const mapped = res.data.map((entry) => mapMalApiAnimeToJikan(entry.node));
          const filtered = filterAnimeItems(mapped, filters);
          const items = sortMediaItems(filtered as unknown as Record<string, unknown>[], filters.order_by, filters.sort) as unknown as JikanAnime[];
          return {
            pagination: buildPagination(page, limit, items.length, Boolean(res.paging?.next)),
            data: items,
          };
        }

        const scraped = await this.scraper.searchAnime(filters);
        const filtered = filterAnimeItems(scraped, filters);
        const items = sortMediaItems(filtered as unknown as Record<string, unknown>[], filters.order_by, filters.sort) as unknown as JikanAnime[];
        return {
          pagination: buildPagination(page, limit, items.length, scraped.length === limit),
          data: items,
        };
      },
      { freshTtlMs: SHORT_TTL_MS },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async getTopAnime(
    filter: string,
    page: number,
    limit: number,
  ): Promise<ServiceResult<JikanListResponse<JikanAnime>>> {
    const rankingType = filter || 'all';
    const key = `top:${rankingType}:p${page}:l${limit}`;
    const offset = (page - 1) * limit;

    const result = await this.cache.getOrFetch<JikanListResponse<JikanAnime>>(
      key,
      async () => {
        // MAL Official API v2 /anime/ranking does not support `ona`, so route `ona` via scraper.
        if (this.malApi && rankingType !== 'ona') {
          const res = await this.malApi.getTopAnime(rankingType, limit, offset);
          const items = res.data.map((entry) => mapMalApiAnimeToJikan(entry.node));
          return {
            pagination: buildPagination(page, limit, items.length, Boolean(res.paging?.next)),
            data: items,
          };
        }

        const items = await this.scraper.getTopAnime(rankingType, page, limit);
        return {
          pagination: buildPagination(page, limit, items.length, items.length === limit),
          data: items,
        };
      },
      { freshTtlMs: SHORT_TTL_MS },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async getSeasonalAnime(
    year?: number,
    season?: string,
    page: number = 1,
    limit: number = 25,
  ): Promise<ServiceResult<JikanListResponse<JikanAnime>>> {
    const current = getCurrentSeason();
    const targetYear = year ?? current.year;
    const targetSeason = (season ?? current.season).toLowerCase();
    const key = `season:${targetYear}:${targetSeason}:p${page}:l${limit}`;
    const offset = (page - 1) * limit;

    const result = await this.cache.getOrFetch<JikanListResponse<JikanAnime>>(
      key,
      async () => {
        if (this.malApi) {
          const res = await this.malApi.getSeasonalAnime(targetYear, targetSeason, limit, offset);
          const items = res.data.map((entry) => mapMalApiAnimeToJikan(entry.node));
          return {
            pagination: buildPagination(page, limit, items.length, Boolean(res.paging?.next)),
            data: items,
          };
        }

        const all = await this.scraper.getSeasonalAnime(targetYear, targetSeason);
        const sliced = all.slice(offset, offset + limit);
        return {
          pagination: buildPagination(page, limit, sliced.length, offset + limit < all.length),
          data: sliced,
        };
      },
      { freshTtlMs: SHORT_TTL_MS },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async getMangaById(id: number): Promise<ServiceResult<JikanSingleResponse<JikanManga>>> {
    const key = `manga:${id}`;
    const result = await this.cache.getOrFetch<JikanSingleResponse<JikanManga>>(key, async () => {
      if (this.malApi) {
        const node = await this.malApi.getMangaById(id);
        return { data: mapMalApiMangaToJikan(node) };
      }
      const scraped = await this.scraper.getMangaById(id);
      return { data: scraped };
    });

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async getMangaCharacters(
    id: number,
  ): Promise<ServiceResult<JikanSingleResponse<JikanCharacterEntry[]>>> {
    const key = `manga:${id}:characters`;
    const result = await this.cache.getOrFetch<JikanSingleResponse<JikanCharacterEntry[]>>(
      key,
      async () => {
        const characters = await this.scraper.getMangaCharacters(id);
        return { data: characters };
      },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async searchManga(filters: MangaSearchFilters): Promise<ServiceResult<JikanListResponse<JikanManga>>> {
    const key = `manga:search:${JSON.stringify(filters)}`;
    const { page, limit } = filters;
    const offset = (page - 1) * limit;
    const includeNsfw = filters.sfw === false;

    const result = await this.cache.getOrFetch<JikanListResponse<JikanManga>>(
      key,
      async () => {
        if (this.malApi) {
          const res = filters.q
            ? await this.malApi.searchManga(filters.q, limit, offset, includeNsfw)
            : await this.malApi.getTopManga('bypopularity', limit, offset);
          const mapped = res.data.map((entry) => mapMalApiMangaToJikan(entry.node));
          const filtered = filterMangaItems(mapped, filters);
          const items = sortMediaItems(filtered as unknown as Record<string, unknown>[], filters.order_by, filters.sort) as unknown as JikanManga[];
          return {
            pagination: buildPagination(page, limit, items.length, Boolean(res.paging?.next)),
            data: items,
          };
        }

        const scraped = await this.scraper.searchManga(filters);
        const filtered = filterMangaItems(scraped, filters);
        const items = sortMediaItems(filtered as unknown as Record<string, unknown>[], filters.order_by, filters.sort) as unknown as JikanManga[];
        return {
          pagination: buildPagination(page, limit, items.length, scraped.length === limit),
          data: items,
        };
      },
      { freshTtlMs: SHORT_TTL_MS },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async getTopManga(
    filter: string,
    page: number,
    limit: number,
  ): Promise<ServiceResult<JikanListResponse<JikanManga>>> {
    const rankingType = filter || 'all';
    const key = `manga:top:${rankingType}:p${page}:l${limit}`;
    const offset = (page - 1) * limit;

    const result = await this.cache.getOrFetch<JikanListResponse<JikanManga>>(
      key,
      async () => {
        if (this.malApi) {
          const res = await this.malApi.getTopManga(rankingType, limit, offset);
          const items = res.data.map((entry) => mapMalApiMangaToJikan(entry.node));
          return {
            pagination: buildPagination(page, limit, items.length, Boolean(res.paging?.next)),
            data: items,
          };
        }

        const items = await this.scraper.getTopManga(rankingType, page, limit);
        return {
          pagination: buildPagination(page, limit, items.length, items.length === limit),
          data: items,
        };
      },
      { freshTtlMs: SHORT_TTL_MS },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async getAnimeNews(id: number): Promise<ServiceResult<JikanSingleResponse<JikanNewsItem[]>>> {
    const key = `anime:${id}:news`;
    const result = await this.cache.getOrFetch<JikanSingleResponse<JikanNewsItem[]>>(
      key,
      async () => ({ data: await this.scraper.getAnimeNews(id) }),
      { freshTtlMs: SHORT_TTL_MS },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async getMangaNews(id: number): Promise<ServiceResult<JikanSingleResponse<JikanNewsItem[]>>> {
    const key = `manga:${id}:news`;
    const result = await this.cache.getOrFetch<JikanSingleResponse<JikanNewsItem[]>>(
      key,
      async () => ({ data: await this.scraper.getMangaNews(id) }),
      { freshTtlMs: SHORT_TTL_MS },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async getGlobalNews(
    page: number,
    limit: number,
  ): Promise<ServiceResult<JikanListResponse<JikanNewsItem>>> {
    const key = `news:global:p${page}:l${limit}`;
    const result = await this.cache.getOrFetch<JikanListResponse<JikanNewsItem>>(
      key,
      async () => {
        const items = await this.scraper.getGlobalNews(page, limit);
        return {
          pagination: buildPagination(page, limit, items.length, items.length === limit),
          data: items,
        };
      },
      { freshTtlMs: SHORT_TTL_MS },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async getAnimeRelations(
    id: number,
  ): Promise<ServiceResult<JikanSingleResponse<JikanRelationEntry[]>>> {
    const key = `anime:${id}:relations`;
    const result = await this.cache.getOrFetch<JikanSingleResponse<JikanRelationEntry[]>>(
      key,
      async () => {
        if (this.malApi) {
          const node = await this.malApi.getAnimeById(id);
          return { data: mapMalApiRelationsToJikan(node.related_anime, node.related_manga) };
        }
        return { data: await this.scraper.getAnimeRelations(id) };
      },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }

  async getMangaRelations(
    id: number,
  ): Promise<ServiceResult<JikanSingleResponse<JikanRelationEntry[]>>> {
    const key = `manga:${id}:relations`;
    const result = await this.cache.getOrFetch<JikanSingleResponse<JikanRelationEntry[]>>(
      key,
      async () => {
        if (this.malApi) {
          const node = await this.malApi.getMangaById(id);
          return { data: mapMalApiRelationsToJikan(node.related_anime, node.related_manga) };
        }
        return { data: await this.scraper.getMangaRelations(id) };
      },
    );

    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.mode,
    };
  }
}
