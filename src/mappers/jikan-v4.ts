import type {
  JikanAnime,
  JikanDateProp,
  JikanImages,
  JikanManga,
  JikanNamedEntity,
  JikanPagination,
  JikanRelationEntry,
} from '../types/jikan.js';

export interface MalApiRelatedItem {
  node: { id: number; title: string };
  relation_type: string;
  relation_type_formatted: string;
}

/** Raw anime node shape returned by MyAnimeList Official API v2. */
export interface MalApiAnimeNode {
  id: number;
  title: string;
  main_picture?: {
    medium?: string;
    large?: string;
  };
  alternative_titles?: {
    synonyms?: string[];
    en?: string;
    ja?: string;
  };
  start_date?: string;
  end_date?: string;
  synopsis?: string;
  mean?: number;
  rank?: number;
  popularity?: number;
  num_list_users?: number;
  num_scoring_users?: number;
  media_type?: string;
  status?: string;
  genres?: Array<{ id: number; name: string }>;
  num_episodes?: number;
  start_season?: {
    year?: number;
    season?: string;
  };
  source?: string;
  average_episode_duration?: number;
  rating?: string;
  studios?: Array<{ id: number; name: string }>;
  background?: string;
  broadcast?: {
    day_of_the_week?: string;
    start_time?: string;
  };
  related_anime?: MalApiRelatedItem[];
  related_manga?: MalApiRelatedItem[];
}

function toWebpUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/\.(jpg|jpeg)(\?.*)?$/i, '.webp$2');
}

export function buildJikanImages(smallImg: string | null, largeImg: string | null): JikanImages {
  return {
    jpg: {
      image_url: smallImg,
      small_image_url: smallImg,
      large_image_url: largeImg,
    },
    webp: {
      image_url: toWebpUrl(smallImg),
      small_image_url: toWebpUrl(smallImg),
      large_image_url: toWebpUrl(largeImg),
    },
  };
}

export function parseDateProp(dateStr: string | null | undefined): JikanDateProp {
  if (!dateStr) return { day: null, month: null, year: null };
  const match = dateStr.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!match) return { day: null, month: null, year: null };
  return {
    year: Number.parseInt(match[1], 10),
    month: match[2] ? Number.parseInt(match[2], 10) : null,
    day: match[3] ? Number.parseInt(match[3], 10) : null,
  };
}

export function emptyAnimeExtras() {
  return {
    trailer: { youtube_id: null, url: null, embed_url: null },
    approved: true,
    title_synonyms: [] as string[],
    background: null as string | null,
    broadcast: { day: null, time: null, timezone: null, string: null },
    producers: [] as JikanNamedEntity[],
    licensors: [] as JikanNamedEntity[],
    explicit_genres: [] as JikanNamedEntity[],
    themes: [] as JikanNamedEntity[],
    demographics: [] as JikanNamedEntity[],
  };
}

const MEDIA_TYPE_MAP: Record<string, string> = {
  tv: 'TV',
  ova: 'OVA',
  movie: 'Movie',
  special: 'Special',
  ona: 'ONA',
  music: 'Music',
  cm: 'CM',
  pv: 'PV',
  tv_special: 'TV Special',
};

const STATUS_MAP: Record<string, string> = {
  finished_airing: 'Finished Airing',
  currently_airing: 'Currently Airing',
  not_yet_aired: 'Not yet aired',
};

function formatDuration(seconds: number | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  return `${mins} min per ep`;
}

function mapEntities(
  items: Array<{ id: number; name: string }> | undefined,
  entityPath: 'anime/genre' | 'anime/producer' | 'manga/genre' | 'manga/magazine' | 'people',
  entityType: 'anime' | 'manga' | 'people' = 'anime',
): JikanNamedEntity[] {
  if (!items) return [];
  return items.map((item) => ({
    mal_id: item.id,
    type: entityType,
    name: item.name,
    url: `https://myanimelist.net/${entityPath}/${item.id}`,
  }));
}

/**
 * Normalizes a MAL Official API v2 anime payload into a Jikan v4 compatible object.
 */
export function mapMalApiAnimeToJikan(node: MalApiAnimeNode): JikanAnime {
  const titles = [{ type: 'Default', title: node.title }];
  if (node.alternative_titles?.en) {
    titles.push({ type: 'English', title: node.alternative_titles.en });
  }
  if (node.alternative_titles?.ja) {
    titles.push({ type: 'Japanese', title: node.alternative_titles.ja });
  }

  const largeImg = node.main_picture?.large ?? node.main_picture?.medium ?? null;
  const smallImg = node.main_picture?.medium ?? largeImg;
  const status = node.status ? (STATUS_MAP[node.status] ?? node.status) : null;
  const day = node.broadcast?.day_of_the_week ?? null;
  const time = node.broadcast?.start_time ?? null;

  return {
    mal_id: node.id,
    url: `https://myanimelist.net/anime/${node.id}`,
    images: buildJikanImages(smallImg, largeImg),
    trailer: { youtube_id: null, url: null, embed_url: null },
    approved: true,
    title: node.title,
    title_english: node.alternative_titles?.en || null,
    title_japanese: node.alternative_titles?.ja || null,
    title_synonyms: node.alternative_titles?.synonyms ?? [],
    titles,
    type: node.media_type ? (MEDIA_TYPE_MAP[node.media_type] ?? node.media_type.toUpperCase()) : null,
    source: node.source ?? null,
    episodes: node.num_episodes ?? null,
    status,
    airing: node.status === 'currently_airing',
    aired: {
      from: node.start_date ?? null,
      to: node.end_date ?? null,
      prop: {
        from: parseDateProp(node.start_date),
        to: parseDateProp(node.end_date),
      },
      string: node.start_date
        ? node.end_date
          ? `${node.start_date} to ${node.end_date}`
          : `${node.start_date} to ?`
        : null,
    },
    duration: formatDuration(node.average_episode_duration),
    rating: node.rating ?? null,
    score: node.mean ?? null,
    scored_by: node.num_scoring_users ?? null,
    rank: node.rank ?? null,
    popularity: node.popularity ?? null,
    members: node.num_list_users ?? null,
    favorites: null,
    synopsis: node.synopsis ?? null,
    background: node.background ?? null,
    season: node.start_season?.season ?? null,
    year: node.start_season?.year ?? null,
    broadcast: {
      day,
      time,
      timezone: day || time ? 'Asia/Tokyo' : null,
      string: day && time ? `${day} at ${time} (JST)` : day ?? null,
    },
    producers: [],
    licensors: [],
    studios: mapEntities(node.studios, 'anime/producer'),
    genres: mapEntities(node.genres, 'anime/genre'),
    explicit_genres: [],
    themes: [],
    demographics: [],
  };
}

export function buildPagination(
  currentPage: number,
  perPage: number,
  count: number,
  hasNextPage: boolean,
): JikanPagination {
  return {
    last_visible_page: hasNextPage ? currentPage + 1 : currentPage,
    has_next_page: hasNextPage,
    current_page: currentPage,
    items: {
      count,
      total: hasNextPage ? (currentPage + 1) * perPage : (currentPage - 1) * perPage + count,
      per_page: perPage,
    },
  };
}

/** Raw manga node shape returned by MyAnimeList Official API v2. */
export interface MalApiMangaNode {
  id: number;
  title: string;
  main_picture?: {
    medium?: string;
    large?: string;
  };
  alternative_titles?: {
    synonyms?: string[];
    en?: string;
    ja?: string;
  };
  start_date?: string;
  end_date?: string;
  synopsis?: string;
  mean?: number;
  rank?: number;
  popularity?: number;
  num_list_users?: number;
  num_scoring_users?: number;
  media_type?: string;
  status?: string;
  genres?: Array<{ id: number; name: string }>;
  num_volumes?: number;
  num_chapters?: number;
  authors?: Array<{ node: { id: number; first_name?: string; last_name?: string }; role?: string }>;
  serialization?: Array<{ node: { id: number; name: string } }>;
  related_anime?: MalApiRelatedItem[];
  related_manga?: MalApiRelatedItem[];
}

const MANGA_TYPE_MAP: Record<string, string> = {
  manga: 'Manga',
  novel: 'Novel',
  light_novel: 'Light Novel',
  one_shot: 'One-shot',
  doujinshi: 'Doujinshi',
  manhwa: 'Manhwa',
  manhua: 'Manhua',
  oel: 'OEL',
};

const MANGA_STATUS_MAP: Record<string, string> = {
  finished: 'Finished',
  currently_publishing: 'Publishing',
  not_yet_published: 'Not yet published',
  on_hiatus: 'On Hiatus',
  discontinued: 'Discontinued',
};

/**
 * Normalizes a MAL Official API v2 manga payload into a Jikan v4 compatible object.
 */
export function mapMalApiMangaToJikan(node: MalApiMangaNode): JikanManga {
  const titles = [{ type: 'Default', title: node.title }];
  if (node.alternative_titles?.en) {
    titles.push({ type: 'English', title: node.alternative_titles.en });
  }
  if (node.alternative_titles?.ja) {
    titles.push({ type: 'Japanese', title: node.alternative_titles.ja });
  }

  const largeImg = node.main_picture?.large ?? node.main_picture?.medium ?? null;
  const smallImg = node.main_picture?.medium ?? largeImg;
  const status = node.status ? (MANGA_STATUS_MAP[node.status] ?? node.status) : null;

  const authors: JikanNamedEntity[] = (node.authors ?? []).map((a) => ({
    mal_id: a.node.id,
    type: 'people',
    name: [a.node.last_name, a.node.first_name].filter(Boolean).join(', ') || `Author #${a.node.id}`,
    url: `https://myanimelist.net/people/${a.node.id}`,
  }));

  const serializations = mapEntities(
    node.serialization?.map((s) => s.node),
    'manga/magazine',
    'manga',
  );

  return {
    mal_id: node.id,
    url: `https://myanimelist.net/manga/${node.id}`,
    images: {
      jpg: {
        image_url: smallImg,
        small_image_url: smallImg,
        large_image_url: largeImg,
      },
    },
    title: node.title,
    title_english: node.alternative_titles?.en || null,
    title_japanese: node.alternative_titles?.ja || null,
    titles,
    type: node.media_type ? (MANGA_TYPE_MAP[node.media_type] ?? node.media_type) : null,
    chapters: node.num_chapters ?? null,
    volumes: node.num_volumes ?? null,
    status,
    publishing: node.status === 'currently_publishing',
    published: {
      from: node.start_date ?? null,
      to: node.end_date ?? null,
      string: node.start_date
        ? node.end_date
          ? `${node.start_date} to ${node.end_date}`
          : `${node.start_date} to ?`
        : null,
    },
    score: node.mean ?? null,
    scored_by: node.num_scoring_users ?? null,
    rank: node.rank ?? null,
    popularity: node.popularity ?? null,
    members: node.num_list_users ?? null,
    favorites: null,
    synopsis: node.synopsis ?? null,
    authors,
    serializations,
    genres: mapEntities(node.genres, 'manga/genre', 'manga'),
  };
}

/**
 * Groups MAL API v2 `related_anime` and `related_manga` arrays into Jikan v4 relation groups.
 */
export function mapMalApiRelationsToJikan(
  relatedAnime?: MalApiRelatedItem[],
  relatedManga?: MalApiRelatedItem[],
): JikanRelationEntry[] {
  const grouped = new Map<string, JikanNamedEntity[]>();

  const addItems = (items: MalApiRelatedItem[] | undefined, type: 'anime' | 'manga') => {
    if (!items) return;
    for (const item of items) {
      const relation = item.relation_type_formatted || item.relation_type;
      const list = grouped.get(relation) ?? [];
      list.push({
        mal_id: item.node.id,
        type,
        name: item.node.title,
        url: `https://myanimelist.net/${type}/${item.node.id}`,
      });
      grouped.set(relation, list);
    }
  };

  addItems(relatedAnime, 'anime');
  addItems(relatedManga, 'manga');

  return Array.from(grouped.entries()).map(([relation, entry]) => ({ relation, entry }));
}
