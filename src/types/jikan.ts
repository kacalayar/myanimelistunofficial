export interface JikanImageVariant {
  image_url: string | null;
  small_image_url?: string | null;
  large_image_url?: string | null;
}

export interface JikanImages {
  jpg: JikanImageVariant;
  webp?: JikanImageVariant;
}

export interface JikanTitle {
  type: string;
  title: string;
}

export interface JikanNamedEntity {
  mal_id: number;
  type: string;
  name: string;
  url: string;
}

export interface JikanDateProp {
  day: number | null;
  month: number | null;
  year: number | null;
}

export interface JikanAnime {
  mal_id: number;
  url: string;
  images: JikanImages;
  trailer: {
    youtube_id: string | null;
    url: string | null;
    embed_url: string | null;
  };
  approved: boolean;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  title_synonyms: string[];
  titles: JikanTitle[];
  type: string | null;
  source: string | null;
  episodes: number | null;
  status: string | null;
  airing: boolean;
  aired: {
    from: string | null;
    to: string | null;
    prop: {
      from: JikanDateProp;
      to: JikanDateProp;
    };
    string: string | null;
  };
  duration: string | null;
  rating: string | null;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  synopsis: string | null;
  background: string | null;
  season: string | null;
  year: number | null;
  broadcast: {
    day: string | null;
    time: string | null;
    timezone: string | null;
    string: string | null;
  };
  producers: JikanNamedEntity[];
  licensors: JikanNamedEntity[];
  studios: JikanNamedEntity[];
  genres: JikanNamedEntity[];
  explicit_genres: JikanNamedEntity[];
  themes: JikanNamedEntity[];
  demographics: JikanNamedEntity[];
}

export interface JikanCharacterEntry {
  character: {
    mal_id: number;
    url: string;
    images: JikanImages;
    name: string;
  };
  role: string;
  favorites: number;
  voice_actors: Array<{
    person: {
      mal_id: number;
      url: string;
      images: { jpg: { image_url: string | null } };
      name: string;
    };
    language: string;
  }>;
}

export interface JikanPagination {
  last_visible_page: number;
  has_next_page: boolean;
  current_page: number;
  items: {
    count: number;
    total: number;
    per_page: number;
  };
}

export interface JikanSingleResponse<T> {
  data: T;
}

export interface JikanListResponse<T> {
  pagination: JikanPagination;
  data: T[];
}

export interface JikanManga {
  mal_id: number;
  url: string;
  images: JikanImages;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  titles: JikanTitle[];
  type: string | null;
  chapters: number | null;
  volumes: number | null;
  status: string | null;
  publishing: boolean;
  published: {
    from: string | null;
    to: string | null;
    string: string | null;
  };
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  synopsis: string | null;
  authors: JikanNamedEntity[];
  serializations: JikanNamedEntity[];
  genres: JikanNamedEntity[];
}

export interface JikanNewsItem {
  mal_id: number;
  url: string;
  title: string;
  date: string | null;
  author_username: string | null;
  author_url: string | null;
  forum_url: string | null;
  images: {
    jpg: {
      image_url: string | null;
    };
  };
  comments: number | null;
  excerpt: string | null;
}

export interface JikanRelationEntry {
  relation: string;
  entry: JikanNamedEntity[];
}
