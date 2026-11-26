import type { MalApiAnimeNode, MalApiMangaNode } from '../mappers/jikan-v4.js';
import { RateLimitedQueue, UpstreamError, withTimeoutAndRetry } from './rate-queue.js';

const MAL_API_BASE = 'https://api.myanimelist.net/v2';

const ANIME_FIELDS = [
  'id',
  'title',
  'main_picture',
  'alternative_titles',
  'start_date',
  'end_date',
  'synopsis',
  'mean',
  'rank',
  'popularity',
  'num_list_users',
  'num_scoring_users',
  'media_type',
  'status',
  'genres',
  'num_episodes',
  'start_season',
  'source',
  'average_episode_duration',
  'rating',
  'studios',
  'background',
  'broadcast',
  'related_anime',
  'related_manga',
].join(',');

const MANGA_FIELDS = [
  'id',
  'title',
  'main_picture',
  'alternative_titles',
  'start_date',
  'end_date',
  'synopsis',
  'mean',
  'rank',
  'popularity',
  'num_list_users',
  'num_scoring_users',
  'media_type',
  'status',
  'genres',
  'num_volumes',
  'num_chapters',
  'authors{first_name,last_name}',
  'serialization{name}',
  'related_anime',
  'related_manga',
].join(',');

export interface MalApiListResponse<T = MalApiAnimeNode> {
  data: Array<{ node: T }>;
  paging?: { next?: string; previous?: string };
}

/**
 * Client for MyAnimeList Official API v2.
 * Requires a free X-MAL-CLIENT-ID header.
 */
export class MalApiClient {
  constructor(
    private readonly clientId: string,
    private readonly queue: RateLimitedQueue,
    private readonly timeoutMs: number,
  ) {}

  private async requestJson<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(`${MAL_API_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    return this.queue.enqueue(() =>
      withTimeoutAndRetry(
        async (signal) => {
          const response = await fetch(url, {
            signal,
            headers: {
              'X-MAL-CLIENT-ID': this.clientId,
              Accept: 'application/json',
            },
          });

          if (!response.ok) {
            const retryable = response.status === 429 || response.status >= 500;
            throw new UpstreamError(
              `MAL API v2 responded with ${response.status} for ${path}`,
              response.status,
              retryable,
            );
          }

          return (await response.json()) as T;
        },
        { timeoutMs: this.timeoutMs },
      ),
    );
  }

  async getAnimeById(id: number): Promise<MalApiAnimeNode> {
    return this.requestJson<MalApiAnimeNode>(`/anime/${id}`, { fields: ANIME_FIELDS });
  }

  async searchAnime(
    query: string,
    limit: number,
    offset: number,
    nsfw = false,
  ): Promise<MalApiListResponse> {
    return this.requestJson<MalApiListResponse>('/anime', {
      q: query,
      limit,
      offset,
      fields: ANIME_FIELDS,
      ...(nsfw ? { nsfw: 'true' } : {}),
    });
  }

  async getTopAnime(rankingType: string, limit: number, offset: number): Promise<MalApiListResponse> {
    return this.requestJson<MalApiListResponse>('/anime/ranking', {
      ranking_type: rankingType,
      limit,
      offset,
      fields: ANIME_FIELDS,
    });
  }

  async getSeasonalAnime(
    year: number,
    season: string,
    limit: number,
    offset: number,
  ): Promise<MalApiListResponse> {
    return this.requestJson<MalApiListResponse>(`/anime/season/${year}/${season}`, {
      limit,
      offset,
      fields: ANIME_FIELDS,
      sort: 'anime_num_list_users',
    });
  }

  async getMangaById(id: number): Promise<MalApiMangaNode> {
    return this.requestJson<MalApiMangaNode>(`/manga/${id}`, { fields: MANGA_FIELDS });
  }

  async searchManga(
    query: string,
    limit: number,
    offset: number,
    nsfw = false,
  ): Promise<MalApiListResponse<MalApiMangaNode>> {
    return this.requestJson<MalApiListResponse<MalApiMangaNode>>('/manga', {
      q: query,
      limit,
      offset,
      fields: MANGA_FIELDS,
      ...(nsfw ? { nsfw: 'true' } : {}),
    });
  }

  async getTopManga(
    rankingType: string,
    limit: number,
    offset: number,
  ): Promise<MalApiListResponse<MalApiMangaNode>> {
    return this.requestJson<MalApiListResponse<MalApiMangaNode>>('/manga/ranking', {
      ranking_type: rankingType,
      limit,
      offset,
      fields: MANGA_FIELDS,
    });
  }
}
