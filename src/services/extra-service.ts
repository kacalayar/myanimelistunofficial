import type { SwrCache } from '../cache/sqlite-swr.js';
import { buildPagination } from '../mappers/jikan-v4.js';
import type { JikanListResponse, JikanSingleResponse } from '../types/jikan.js';
import type { DiscoveryScraper } from '../upstream/scrapers/discovery-scraper.js';
import type { EntitiesScraper } from '../upstream/scrapers/entities-scraper.js';
import type { SubresourcesScraper } from '../upstream/scrapers/subresources-scraper.js';
import type { AnimeService, ServiceResult } from './anime-service.js';

const SHORT_TTL_MS = 60 * 60 * 1000;

/**
 * Modular service covering all extended Jikan v4 endpoints
 * (sub-resources, schedules, genres, characters, people, producers, magazines, watch, random, clubs, users).
 */
export class ExtraService {
  constructor(
    private readonly cache: SwrCache,
    private readonly animeService: AnimeService,
    readonly subresources: SubresourcesScraper,
    readonly discovery: DiscoveryScraper,
    readonly entities: EntitiesScraper,
  ) {}

  async cachedSingle<T>(
    key: string,
    fetcher: () => Promise<T>,
    freshTtlMs?: number,
  ): Promise<ServiceResult<JikanSingleResponse<T>>> {
    const result = await this.cache.getOrFetch<JikanSingleResponse<T>>(
      key,
      async () => ({ data: await fetcher() }),
      freshTtlMs ? { freshTtlMs } : undefined,
    );
    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.animeService.mode,
    };
  }

  async cachedList<T>(
    key: string,
    page: number,
    limit: number,
    fetcher: () => Promise<T[]>,
    freshTtlMs = SHORT_TTL_MS,
  ): Promise<ServiceResult<JikanListResponse<T>>> {
    const result = await this.cache.getOrFetch<JikanListResponse<T>>(
      key,
      async () => {
        const all = await fetcher();
        const sliced = all.slice(0, limit);
        return {
          pagination: buildPagination(page, limit, sliced.length, all.length >= limit),
          data: sliced,
        };
      },
      { freshTtlMs },
    );
    return {
      payload: result.data,
      cacheStatus: result.cacheStatus,
      ageMs: result.ageMs,
      upstreamMode: this.animeService.mode,
    };
  }

  async getAnimeFull(id: number) {
    return this.cachedSingle(`anime:${id}:full`, async () => {
      const [detail, relations, external, streaming, theme] = await Promise.all([
        this.animeService.getAnimeById(id),
        this.animeService.getAnimeRelations(id),
        this.subresources.getExternalLinks('anime', id),
        this.subresources.getStreamingLinks(id),
        this.subresources.getAnimeThemes(id),
      ]);
      return {
        ...detail.payload.data,
        relations: relations.payload.data,
        theme,
        external,
        streaming,
      };
    });
  }

  async getMangaFull(id: number) {
    return this.cachedSingle(`manga:${id}:full`, async () => {
      const [detail, relations, external] = await Promise.all([
        this.animeService.getMangaById(id),
        this.animeService.getMangaRelations(id),
        this.subresources.getExternalLinks('manga', id),
      ]);
      return {
        ...detail.payload.data,
        relations: relations.payload.data,
        external,
      };
    });
  }

  async getRandom(type: 'anime' | 'manga' | 'characters' | 'people' | 'users'): Promise<ServiceResult<JikanSingleResponse<unknown>>> {
    const data = await this.discovery.getRandomResource(type);
    return {
      payload: { data },
      cacheStatus: 'MISS',
      ageMs: 0,
      upstreamMode: this.animeService.mode,
    };
  }
}
