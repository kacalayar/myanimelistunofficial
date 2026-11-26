export type AnimeRatingFilter = 'g' | 'pg' | 'pg13' | 'r17' | 'r' | 'rx';

export interface AnimeSearchFilters {
  q?: string;
  page: number;
  limit: number;
  type?: 'tv' | 'movie' | 'ova' | 'special' | 'ona' | 'music' | 'cm' | 'pv' | 'tv_special';
  score?: number;
  min_score?: number;
  max_score?: number;
  status?: 'airing' | 'complete' | 'upcoming';
  rating?: AnimeRatingFilter;
  sfw?: boolean;
  genres?: string;
  genres_exclude?: string;
  producers?: string;
  start_date?: string;
  end_date?: string;
  letter?: string;
  unapproved?: boolean;
  order_by?: string;
  sort?: 'asc' | 'desc';
}

export interface MangaSearchFilters {
  q?: string;
  page: number;
  limit: number;
  type?: 'manga' | 'novel' | 'lightnovel' | 'oneshot' | 'doujin' | 'manhwa' | 'manhua';
  score?: number;
  min_score?: number;
  max_score?: number;
  status?: 'publishing' | 'complete' | 'hiatus' | 'discontinued' | 'upcoming';
  sfw?: boolean;
  genres?: string;
  genres_exclude?: string;
  magazines?: string;
  start_date?: string;
  end_date?: string;
  letter?: string;
  unapproved?: boolean;
  order_by?: string;
  sort?: 'asc' | 'desc';
}

/** Maps Jikan v4 rating enum to MAL Official API v2 `rating` string. */
export const JIKAN_TO_MAL_API_RATING: Record<AnimeRatingFilter, string> = {
  g: 'g',
  pg: 'pg',
  pg13: 'pg_13',
  r17: 'r',
  r: 'r+',
  rx: 'rx',
};

/** Maps Jikan v4 rating enum to MAL web `/anime.php?r=...` integer ID. */
export const JIKAN_TO_MAL_WEB_RATING: Record<AnimeRatingFilter, string> = {
  g: '1',
  pg: '2',
  pg13: '3',
  r17: '4',
  r: '5',
  rx: '6',
};

const ADULT_GENRE_NAMES = new Set(['Hentai', 'Erotica']);

/**
 * Applies Jikan v4 client-side filtering (rating, sfw, score bounds, type, status)
 * when upstream (such as MAL API v2) does not support all query params natively.
 */
export function filterAnimeItems<
  T extends {
    title: string;
    type: string | null;
    status: string | null;
    score: number | null;
    rating: string | null;
    genres: Array<{ mal_id?: number; name: string }>;
  },
>(items: T[], filters: AnimeSearchFilters): T[] {
  const excludedIds = new Set(
    (filters.genres_exclude ?? '')
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n)),
  );
  const letter = filters.letter?.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.sfw) {
      if (item.rating === 'rx') return false;
      if (item.genres.some((g) => ADULT_GENRE_NAMES.has(g.name))) return false;
    }
    if (excludedIds.size > 0 && item.genres.some((g) => g.mal_id && excludedIds.has(g.mal_id))) {
      return false;
    }
    if (letter && !item.title.toLowerCase().startsWith(letter)) {
      return false;
    }
    if (filters.rating) {
      const expected = JIKAN_TO_MAL_API_RATING[filters.rating];
      if (item.rating && item.rating.toLowerCase() !== expected) return false;
    }
    if (filters.type && item.type && item.type.toLowerCase() !== filters.type.replace('_', ' ')) {
      return false;
    }
    if (filters.min_score !== undefined && (item.score === null || item.score < filters.min_score)) {
      return false;
    }
    if (filters.max_score !== undefined && (item.score === null || item.score > filters.max_score)) {
      return false;
    }
    if (filters.score !== undefined && (item.score === null || item.score < filters.score)) {
      return false;
    }
    return true;
  });
}

export function filterMangaItems<
  T extends {
    title: string;
    type: string | null;
    score: number | null;
    genres: Array<{ mal_id?: number; name: string }>;
  },
>(items: T[], filters: MangaSearchFilters): T[] {
  const excludedIds = new Set(
    (filters.genres_exclude ?? '')
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n)),
  );
  const letter = filters.letter?.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.sfw && item.genres.some((g) => ADULT_GENRE_NAMES.has(g.name))) {
      return false;
    }
    if (excludedIds.size > 0 && item.genres.some((g) => g.mal_id && excludedIds.has(g.mal_id))) {
      return false;
    }
    if (letter && !item.title.toLowerCase().startsWith(letter)) {
      return false;
    }
    if (filters.type && item.type && item.type.toLowerCase() !== filters.type) {
      return false;
    }
    if (filters.min_score !== undefined && (item.score === null || item.score < filters.min_score)) {
      return false;
    }
    if (filters.max_score !== undefined && (item.score === null || item.score > filters.max_score)) {
      return false;
    }
    return true;
  });
}
