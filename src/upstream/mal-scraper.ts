import * as cheerio from 'cheerio';
import { buildJikanImages, emptyAnimeExtras } from '../mappers/jikan-v4.js';
import type {
  JikanAnime,
  JikanCharacterEntry,
  JikanManga,
  JikanNamedEntity,
  JikanNewsItem,
  JikanRelationEntry,
} from '../types/jikan.js';
import {
  JIKAN_TO_MAL_WEB_RATING,
  type AnimeSearchFilters,
  type MangaSearchFilters,
} from '../types/search.js';
import { RateLimitedQueue, UpstreamError, withTimeoutAndRetry } from './rate-queue.js';

const MAL_WEB_BASE = 'https://myanimelist.net';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function parseNumeric(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function extractIdFromUrl(href: string | undefined, segment: string): number | null {
  if (!href) return null;
  const match = href.match(new RegExp(`/${segment}/(\\d+)`));
  return match ? Number.parseInt(match[1], 10) : null;
}

function readSidebarField($: cheerio.CheerioAPI, label: string): string | null {
  let result: string | null = null;
  $('.spaceit_pad').each((_, el) => {
    const spanText = $(el).find('span.dark_text').first().text().trim();
    if (spanText.toLowerCase().startsWith(label.toLowerCase())) {
      const clone = $(el).clone();
      clone.find('span.dark_text').remove();
      const text = clone.text().replace(/\s+/g, ' ').trim();
      if (text && text !== 'None found, add some' && text !== 'Unknown') {
        result = text;
      }
    }
  });
  return result;
}

function readSidebarEntities(
  $: cheerio.CheerioAPI,
  label: string,
  segment: string,
): JikanNamedEntity[] {
  const entities: JikanNamedEntity[] = [];
  $('.spaceit_pad').each((_, el) => {
    const spanText = $(el).find('span.dark_text').first().text().trim();
    if (!spanText.toLowerCase().startsWith(label.toLowerCase())) return;

    $(el)
      .find('a')
      .each((__, anchor) => {
        const href = $(anchor).attr('href');
        const name = $(anchor).text().trim();
        const id = extractIdFromUrl(href, segment);
        if (id && name) {
          entities.push({
            mal_id: id,
            type: 'anime',
            name,
            url: href?.startsWith('http') ? href : `${MAL_WEB_BASE}${href}`,
          });
        }
      });
  });
  return entities;
}

/**
 * Parses a MyAnimeList `/anime/:id` HTML page into a Jikan v4 compatible object.
 */
export function parseAnimeHtml(html: string, id: number): JikanAnime {
  const $ = cheerio.load(html);
  const title = $('h1.title-name').first().text().trim() || $('meta[property="og:title"]').attr('content')?.trim() || `Anime #${id}`;
  const titleEnglish = $('p.title-english').first().text().trim() || readSidebarField($, 'English:');
  const titleJapanese = readSidebarField($, 'Japanese:');

  const imageUrl =
    $('img[itemprop="image"]').attr('data-src') ||
    $('img[itemprop="image"]').attr('src') ||
    $('meta[property="og:image"]').attr('content') ||
    null;

  const scoreText = $('.score-label').first().text().trim();
  const score = scoreText === 'N/A' ? null : parseNumeric(scoreText);
  const scoredBy = parseNumeric($('span[itemprop="ratingCount"]').text());

  const rankText = $('.numbers.ranked strong').first().text();
  const rank = parseNumeric(rankText);

  const popularityText = $('.numbers.popularity strong').first().text();
  const popularity = parseNumeric(popularityText);

  const membersText = $('.numbers.members strong').first().text();
  const members = parseNumeric(membersText);

  const synopsis = $('p[itemprop="description"]').text().trim() || null;
  const type = readSidebarField($, 'Type:');
  const episodes = parseNumeric(readSidebarField($, 'Episodes:'));
  const status = readSidebarField($, 'Status:');
  const airedString = readSidebarField($, 'Aired:');
  const duration = readSidebarField($, 'Duration:');
  const rating = readSidebarField($, 'Rating:');
  const source = readSidebarField($, 'Source:');
  const favorites = parseNumeric(readSidebarField($, 'Favorites:'));
  const premiered = readSidebarField($, 'Premiered:');

  let season: string | null = null;
  let year: number | null = null;
  if (premiered) {
    const match = premiered.match(/(Spring|Summer|Fall|Winter)\s+(\d{4})/i);
    if (match) {
      season = match[1].toLowerCase();
      year = Number.parseInt(match[2], 10);
    }
  }

  const producers = readSidebarEntities($, 'Producers:', 'anime/producer');
  const licensors = readSidebarEntities($, 'Licensors:', 'anime/producer');
  const studios = readSidebarEntities($, 'Studios:', 'anime/producer');
  const genres = readSidebarEntities($, 'Genres:', 'anime/genre');
  const explicitGenres = readSidebarEntities($, 'Explicit Genres:', 'anime/genre');
  const themes = readSidebarEntities($, 'Themes:', 'anime/genre').concat(
    readSidebarEntities($, 'Theme:', 'anime/genre'),
  );
  const demographics = readSidebarEntities($, 'Demographic:', 'anime/genre').concat(
    readSidebarEntities($, 'Demographics:', 'anime/genre'),
  );

  const synonymsRaw = readSidebarField($, 'Synonyms:');
  const titleSynonyms = synonymsRaw
    ? synonymsRaw.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const embedUrl = $('.video-promotion a.iframe').attr('href') || null;
  const ytMatch = embedUrl?.match(/youtube\.com\/embed\/([^?&]+)/);
  const youtubeId = ytMatch ? ytMatch[1] : null;

  const broadcastString = readSidebarField($, 'Broadcast:');
  const bcMatch = broadcastString?.match(/^([A-Za-z]+)\s+at\s+(\d{1,2}:\d{2})\s*\(([^)]+)\)/i);

  const bgHeading = $('h2:contains("Background")').first();
  let background: string | null = null;
  if (bgHeading.length) {
    const bgParent = bgHeading.parent().clone();
    bgParent.find('h2').remove();
    const bgText = bgParent.text().trim();
    if (bgText && !bgText.startsWith('No background information')) {
      background = bgText;
    }
  }

  const titles = [{ type: 'Default', title }];
  if (titleEnglish) titles.push({ type: 'English', title: titleEnglish });
  if (titleJapanese) titles.push({ type: 'Japanese', title: titleJapanese });

  return {
    mal_id: id,
    url: `${MAL_WEB_BASE}/anime/${id}`,
    images: buildJikanImages(imageUrl, imageUrl),
    trailer: {
      youtube_id: youtubeId,
      url: youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null,
      embed_url: embedUrl,
    },
    approved: true,
    title,
    title_english: titleEnglish,
    title_japanese: titleJapanese,
    title_synonyms: titleSynonyms,
    titles,
    type,
    source,
    episodes,
    status,
    airing: status?.toLowerCase().includes('currently airing') ?? false,
    aired: {
      from: null,
      to: null,
      prop: {
        from: { day: null, month: null, year: null },
        to: { day: null, month: null, year: null },
      },
      string: airedString,
    },
    duration,
    rating,
    score,
    scored_by: scoredBy,
    rank,
    popularity,
    members,
    favorites,
    synopsis,
    background,
    season,
    year,
    broadcast: {
      day: bcMatch ? bcMatch[1] : null,
      time: bcMatch ? bcMatch[2] : null,
      timezone: bcMatch ? (bcMatch[3] === 'JST' ? 'Asia/Tokyo' : bcMatch[3]) : null,
      string: broadcastString,
    },
    producers,
    licensors,
    studios,
    genres,
    explicit_genres: explicitGenres,
    themes,
    demographics,
  };
}

/**
 * Parses a MyAnimeList `/anime/:id/_/characters` HTML page.
 */
export function parseCharactersHtml(html: string): JikanCharacterEntry[] {
  const $ = cheerio.load(html);
  const results: JikanCharacterEntry[] = [];

  $('table.js-anime-character-table').each((_, table) => {
    const charAnchor = $(table).find('td').eq(1).find('a').first();
    const charHref = charAnchor.attr('href');
    const charId = extractIdFromUrl(charHref, 'character');
    const charName = charAnchor.text().trim();
    if (!charId || !charName) return;

    const charImg =
      $(table).find('td').eq(0).find('img').attr('data-src') ||
      $(table).find('td').eq(0).find('img').attr('src') ||
      null;
    const role = $(table).find('td').eq(1).find('.spaceit_pad').eq(1).text().trim() || 'Supporting';

    const voiceActors: JikanCharacterEntry['voice_actors'] = [];
    $(table)
      .find('table tr')
      .each((__, vaRow) => {
        const vaAnchor = $(vaRow).find('a').first();
        const vaHref = vaAnchor.attr('href');
        const vaId = extractIdFromUrl(vaHref, 'people');
        const vaName = vaAnchor.text().trim();
        if (!vaId || !vaName) return;

        const language = $(vaRow).find('small').last().text().trim() || 'Japanese';
        const vaImg =
          $(vaRow).find('img').attr('data-src') ||
          $(vaRow).find('img').attr('src') ||
          null;

        voiceActors.push({
          person: {
            mal_id: vaId,
            url: vaHref?.startsWith('http') ? vaHref : `${MAL_WEB_BASE}${vaHref}`,
            images: { jpg: { image_url: vaImg } },
            name: vaName,
          },
          language,
        });
      });

    results.push({
      character: {
        mal_id: charId,
        url: charHref?.startsWith('http') ? charHref : `${MAL_WEB_BASE}${charHref}`,
        images: { jpg: { image_url: charImg } },
        name: charName,
      },
      role,
      favorites: 0,
      voice_actors: voiceActors,
    });
  });

  return results;
}

/**
 * Parses a MyAnimeList `/topanime.php` HTML page into a compact list of JikanAnime items.
 */
export function parseTopAnimeHtml(html: string): JikanAnime[] {
  const $ = cheerio.load(html);
  const list: JikanAnime[] = [];

  $('tr.ranking-list').each((_, row) => {
    const titleAnchor = $(row).find('h3.anime_ranking_h3 a').first();
    const href = titleAnchor.attr('href');
    const id = extractIdFromUrl(href, 'anime');
    const title = titleAnchor.text().trim();
    if (!id || !title) return;

    const img =
      $(row).find('img').attr('data-src') ||
      $(row).find('img').attr('src') ||
      null;
    const rank = parseNumeric($(row).find('td.rank span').first().text());
    const score = parseNumeric($(row).find('td.score span.score-label').first().text());
    const infoLines = $(row)
      .find('div.information')
      .text()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const typeMatch = infoLines[0]?.match(/^([A-Za-z\s]+)\s+\((\d+|\?)\s+eps?\)/i);
    const type = typeMatch ? typeMatch[1].trim() : null;
    const episodes = typeMatch && typeMatch[2] !== '?' ? Number.parseInt(typeMatch[2], 10) : null;
    const members = parseNumeric(infoLines[2]);

    list.push({
      mal_id: id,
      url: href?.startsWith('http') ? href : `${MAL_WEB_BASE}/anime/${id}`,
      images: buildJikanImages(img, img),
      ...emptyAnimeExtras(),
      title,
      title_english: null,
      title_japanese: null,
      titles: [{ type: 'Default', title }],
      type,
      source: null,
      episodes,
      status: null,
      airing: false,
      aired: {
        from: null,
        to: null,
        prop: { from: { day: null, month: null, year: null }, to: { day: null, month: null, year: null } },
        string: infoLines[1] ?? null,
      },
      duration: null,
      rating: null,
      score,
      scored_by: null,
      rank,
      popularity: null,
      members,
      favorites: null,
      synopsis: null,
      season: null,
      year: null,
      studios: [],
      genres: [],
    });
  });

  return list;
}

/**
 * Parses a MyAnimeList `/anime.php?q=...` search page.
 */
export function parseSearchHtml(html: string): JikanAnime[] {
  const $ = cheerio.load(html);
  const list: JikanAnime[] = [];

  $('div.js-categories-seasonal table tr').each((idx, row) => {
    if (idx === 0) return;
    const anchor = $(row).find('a.hoverinfo_trigger strong').first().parent();
    const href = anchor.attr('href');
    const id = extractIdFromUrl(href, 'anime');
    const title = anchor.text().trim();
    if (!id || !title) return;

    const cells = $(row).find('td');
    const img = cells.eq(0).find('img').attr('data-src') || cells.eq(0).find('img').attr('src') || null;
    const synopsis = cells.eq(1).find('div.pt4').text().replace(/read more\.$/i, '').trim() || null;
    const type = cells.eq(2).text().trim() || null;
    const episodes = parseNumeric(cells.eq(3).text());
    const score = parseNumeric(cells.eq(4).text());

    list.push({
      mal_id: id,
      url: href?.startsWith('http') ? href : `${MAL_WEB_BASE}/anime/${id}`,
      images: buildJikanImages(img, img),
      ...emptyAnimeExtras(),
      title,
      title_english: null,
      title_japanese: null,
      titles: [{ type: 'Default', title }],
      type,
      source: null,
      episodes,
      status: null,
      airing: false,
      aired: {
        from: null,
        to: null,
        prop: { from: { day: null, month: null, year: null }, to: { day: null, month: null, year: null } },
        string: null,
      },
      duration: null,
      rating: null,
      score,
      scored_by: null,
      rank: null,
      popularity: null,
      members: null,
      favorites: null,
      synopsis,
      season: null,
      year: null,
      studios: [],
      genres: [],
    });
  });

  return list;
}

/**
 * Parses a MyAnimeList `/anime/season/...` HTML page.
 */
export function parseSeasonalHtml(html: string, year?: number, season?: string): JikanAnime[] {
  const $ = cheerio.load(html);
  const list: JikanAnime[] = [];

  $('div.seasonal-anime.js-seasonal-anime').each((_, card) => {
    const titleAnchor = $(card).find('h2.h2_anime_title a').first();
    const href = titleAnchor.attr('href');
    const id = extractIdFromUrl(href, 'anime');
    const title = titleAnchor.text().trim();
    if (!id || !title) return;

    const img =
      $(card).find('div.image img').attr('data-src') ||
      $(card).find('div.image img').attr('src') ||
      null;
    const synopsis = $(card).find('div.synopsis p.preline').text().trim() || null;
    const score = parseNumeric($(card).find('div.score-label').first().text());
    const members = parseNumeric($(card).find('div.scormem-item.member').first().text());

    const genres: JikanNamedEntity[] = [];
    $(card)
      .find('div.genres span.genre a')
      .each((__, g) => {
        const gHref = $(g).attr('href');
        const gId = extractIdFromUrl(gHref, 'anime/genre');
        const gName = $(g).text().trim();
        if (gId && gName) {
          genres.push({ mal_id: gId, type: 'anime', name: gName, url: `${MAL_WEB_BASE}${gHref}` });
        }
      });

    list.push({
      mal_id: id,
      url: href?.startsWith('http') ? href : `${MAL_WEB_BASE}/anime/${id}`,
      images: buildJikanImages(img, img),
      ...emptyAnimeExtras(),
      title,
      title_english: null,
      title_japanese: null,
      titles: [{ type: 'Default', title }],
      type: null,
      source: null,
      episodes: null,
      status: null,
      airing: true,
      aired: {
        from: null,
        to: null,
        prop: { from: { day: null, month: null, year: null }, to: { day: null, month: null, year: null } },
        string: null,
      },
      duration: null,
      rating: null,
      score,
      scored_by: null,
      rank: null,
      popularity: null,
      members,
      favorites: null,
      synopsis,
      season: season ?? null,
      year: year ?? null,
      studios: [],
      genres,
    });
  });

  return list;
}

/**
 * Parses a MyAnimeList `/manga/:id` HTML page into a Jikan v4 compatible object.
 */
export function parseMangaHtml(html: string, id: number): JikanManga {
  const $ = cheerio.load(html);
  const title =
    $('span[itemprop="name"]').first().text().trim() ||
    $('h1.h1 span').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    `Manga #${id}`;
  const titleEnglish = readSidebarField($, 'English:');
  const titleJapanese = readSidebarField($, 'Japanese:');

  const imageUrl =
    $('img[itemprop="image"]').attr('data-src') ||
    $('img[itemprop="image"]').attr('src') ||
    $('meta[property="og:image"]').attr('content') ||
    null;

  const scoreText = $('.score-label').first().text().trim();
  const score = scoreText === 'N/A' ? null : parseNumeric(scoreText);
  const scoredBy = parseNumeric($('span[itemprop="ratingCount"]').text());
  const rank = parseNumeric($('.numbers.ranked strong').first().text());
  const popularity = parseNumeric($('.numbers.popularity strong').first().text());
  const members = parseNumeric($('.numbers.members strong').first().text());

  const synopsis = $('span[itemprop="description"]').text().trim() || $('p[itemprop="description"]').text().trim() || null;
  const type = readSidebarField($, 'Type:');
  const volumes = parseNumeric(readSidebarField($, 'Volumes:'));
  const chapters = parseNumeric(readSidebarField($, 'Chapters:'));
  const status = readSidebarField($, 'Status:');
  const publishedString = readSidebarField($, 'Published:');
  const favorites = parseNumeric(readSidebarField($, 'Favorites:'));

  const authors = readSidebarEntities($, 'Authors:', 'people').map((e) => ({ ...e, type: 'people' }));
  const serializations = readSidebarEntities($, 'Serialization:', 'manga/magazine').map((e) => ({
    ...e,
    type: 'manga',
  }));
  const genres = readSidebarEntities($, 'Genres:', 'manga/genre').map((e) => ({ ...e, type: 'manga' }));

  const titles = [{ type: 'Default', title }];
  if (titleEnglish) titles.push({ type: 'English', title: titleEnglish });
  if (titleJapanese) titles.push({ type: 'Japanese', title: titleJapanese });

  return {
    mal_id: id,
    url: `${MAL_WEB_BASE}/manga/${id}`,
    images: {
      jpg: {
        image_url: imageUrl,
        small_image_url: imageUrl,
        large_image_url: imageUrl,
      },
    },
    title,
    title_english: titleEnglish,
    title_japanese: titleJapanese,
    titles,
    type,
    chapters,
    volumes,
    status,
    publishing: status?.toLowerCase().includes('publishing') ?? false,
    published: {
      from: null,
      to: null,
      string: publishedString,
    },
    score,
    scored_by: scoredBy,
    rank,
    popularity,
    members,
    favorites,
    synopsis,
    authors,
    serializations,
    genres,
  };
}

/**
 * Parses a MyAnimeList `/topmanga.php` HTML page.
 */
export function parseTopMangaHtml(html: string): JikanManga[] {
  const $ = cheerio.load(html);
  const list: JikanManga[] = [];

  $('tr.ranking-list').each((_, row) => {
    const titleAnchor = $(row).find('h3.manga_h3 a, a.hoverinfo_trigger.fs14.fw-b').first();
    const href = titleAnchor.attr('href');
    const id = extractIdFromUrl(href, 'manga');
    const title = titleAnchor.text().trim();
    if (!id || !title) return;

    const img = $(row).find('img').attr('data-src') || $(row).find('img').attr('src') || null;
    const rank = parseNumeric($(row).find('td.rank span').first().text());
    const score = parseNumeric($(row).find('td.score span.score-label').first().text());
    const infoLines = $(row)
      .find('div.information')
      .text()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const typeMatch = infoLines[0]?.match(/^([A-Za-z\s-]+)\s+\((\d+|\?)\s+vols?\)/i);
    const type = typeMatch ? typeMatch[1].trim() : null;
    const volumes = typeMatch && typeMatch[2] !== '?' ? Number.parseInt(typeMatch[2], 10) : null;
    const members = parseNumeric(infoLines[2]);

    list.push({
      mal_id: id,
      url: href?.startsWith('http') ? href : `${MAL_WEB_BASE}/manga/${id}`,
      images: { jpg: { image_url: img, small_image_url: img, large_image_url: img } },
      title,
      title_english: null,
      title_japanese: null,
      titles: [{ type: 'Default', title }],
      type,
      chapters: null,
      volumes,
      status: null,
      publishing: false,
      published: { from: null, to: null, string: infoLines[1] ?? null },
      score,
      scored_by: null,
      rank,
      popularity: null,
      members,
      favorites: null,
      synopsis: null,
      authors: [],
      serializations: [],
      genres: [],
    });
  });

  return list;
}

/**
 * Parses a MyAnimeList `/manga.php?q=...` search page.
 */
export function parseMangaSearchHtml(html: string): JikanManga[] {
  const $ = cheerio.load(html);
  const list: JikanManga[] = [];

  $('div.js-categories-seasonal table tr').each((idx, row) => {
    if (idx === 0) return;
    const anchor = $(row).find('a.hoverinfo_trigger strong').first().parent();
    const href = anchor.attr('href');
    const id = extractIdFromUrl(href, 'manga');
    const title = anchor.text().trim();
    if (!id || !title) return;

    const cells = $(row).find('td');
    const img = cells.eq(0).find('img').attr('data-src') || cells.eq(0).find('img').attr('src') || null;
    const synopsis = cells.eq(1).find('div.pt4').text().replace(/read more\.$/i, '').trim() || null;
    const type = cells.eq(2).text().trim() || null;
    const volumes = parseNumeric(cells.eq(3).text());
    const score = parseNumeric(cells.eq(4).text());

    list.push({
      mal_id: id,
      url: href?.startsWith('http') ? href : `${MAL_WEB_BASE}/manga/${id}`,
      images: { jpg: { image_url: img, small_image_url: img, large_image_url: img } },
      title,
      title_english: null,
      title_japanese: null,
      titles: [{ type: 'Default', title }],
      type,
      chapters: null,
      volumes,
      status: null,
      publishing: false,
      published: { from: null, to: null, string: null },
      score,
      scored_by: null,
      rank: null,
      popularity: null,
      members: null,
      favorites: null,
      synopsis,
      authors: [],
      serializations: [],
      genres: [],
    });
  });

  return list;
}

/**
 * Parses MyAnimeList news cards from `/news`, `/anime/:id/_/news`, or `/manga/:id/_/news`.
 */
export function parseNewsHtml(html: string): JikanNewsItem[] {
  const $ = cheerio.load(html);
  const items: JikanNewsItem[] = [];

  $('.news-unit').each((_, el) => {
    const titleAnchor = $(el).find('p.title a').first();
    const href = titleAnchor.attr('href');
    const title = titleAnchor.text().trim();
    const id = extractIdFromUrl(href, 'news');
    if (!id || !title) return;

    const imageUrl =
      $(el).find('a.image-link img').attr('data-src') ||
      $(el).find('a.image-link img').attr('src') ||
      null;
    const excerpt = $(el).find('div.text').text().trim() || null;

    const infoEl = $(el).find('div.information p.info').first();
    const infoText = infoEl.text().replace(/\s+/g, ' ').trim();
    const dateMatch = infoText.match(/^(.+?)\s+by\s+/i);
    const date = dateMatch ? dateMatch[1].trim() : null;

    const authorAnchor = infoEl.find('a').first();
    const authorUsername = authorAnchor.text().trim() || null;
    const authorHref = authorAnchor.attr('href');
    const authorUrl = authorHref
      ? authorHref.startsWith('http')
        ? authorHref
        : `${MAL_WEB_BASE}${authorHref}`
      : null;

    const forumAnchor = infoEl.find('a.comment').first();
    const forumHref = forumAnchor.attr('href');
    const forumUrl = forumHref
      ? forumHref.startsWith('http')
        ? forumHref
        : `${MAL_WEB_BASE}${forumHref}`
      : null;
    const comments = parseNumeric(forumAnchor.text());

    items.push({
      mal_id: id,
      url: href?.startsWith('http') ? href : `${MAL_WEB_BASE}${href}`,
      title,
      date,
      author_username: authorUsername,
      author_url: authorUrl,
      forum_url: forumUrl,
      images: { jpg: { image_url: imageUrl } },
      comments,
      excerpt,
    });
  });

  return items;
}

/**
 * Parses MyAnimeList related anime/manga table from `/anime/:id` or `/manga/:id`.
 */
export function parseRelationsHtml(html: string): JikanRelationEntry[] {
  const $ = cheerio.load(html);
  const relations: JikanRelationEntry[] = [];

  $('table.anime_detail_related_anime tr').each((_, row) => {
    const label = $(row).find('td').eq(0).text().replace(/:$/, '').trim();
    if (!label) return;

    const entry: JikanNamedEntity[] = [];
    $(row)
      .find('td')
      .eq(1)
      .find('a')
      .each((__, anchor) => {
        const href = $(anchor).attr('href');
        const name = $(anchor).text().trim();
        if (!href || !name) return;

        const animeId = extractIdFromUrl(href, 'anime');
        const mangaId = extractIdFromUrl(href, 'manga');
        const id = animeId ?? mangaId;
        const type = animeId ? 'anime' : mangaId ? 'manga' : null;
        if (!id || !type) return;

        entry.push({
          mal_id: id,
          type,
          name,
          url: href.startsWith('http') ? href : `${MAL_WEB_BASE}${href}`,
        });
      });

    if (entry.length > 0) {
      relations.push({ relation: label, entry });
    }
  });

  return relations;
}

/**
 * HTML Scraper for MyAnimeList web pages.
 * Used for endpoints missing from MAL Official API v2 (e.g. characters)
 * and as an automatic fallback when MAL_CLIENT_ID is not configured.
 */
export class MalScraper {
  constructor(
    private readonly queue: RateLimitedQueue,
    private readonly timeoutMs: number,
  ) {}

  private async fetchHtml(path: string): Promise<string> {
    const url = `${MAL_WEB_BASE}${path}`;
    return this.queue.enqueue(() =>
      withTimeoutAndRetry(
        async (signal) => {
          const response = await fetch(url, { signal, headers: DEFAULT_HEADERS });
          if (!response.ok) {
            const retryable = response.status === 429 || response.status >= 500;
            throw new UpstreamError(
              `MAL web page returned ${response.status} for ${path}`,
              response.status,
              retryable,
            );
          }
          return response.text();
        },
        { timeoutMs: this.timeoutMs },
      ),
    );
  }

  async getAnimeById(id: number): Promise<JikanAnime> {
    const html = await this.fetchHtml(`/anime/${id}`);
    return parseAnimeHtml(html, id);
  }

  async getAnimeCharacters(id: number): Promise<JikanCharacterEntry[]> {
    const html = await this.fetchHtml(`/anime/${id}/_/characters`);
    return parseCharactersHtml(html);
  }

  async searchAnime(filters: AnimeSearchFilters): Promise<JikanAnime[]> {
    if (!filters.q && (filters.status === 'upcoming' || filters.status === 'airing')) {
      return this.getTopAnime(filters.status, filters.page, filters.limit);
    }

    const statusMap: Record<string, string> = { airing: '1', complete: '2', upcoming: '3' };
    const show = (filters.page - 1) * 50;
    const params = new URLSearchParams({ cat: 'anime', show: String(show) });
    if (filters.q) params.set('q', filters.q);
    if (filters.letter) params.set('letter', filters.letter);
    if (filters.status && statusMap[filters.status]) params.set('status', statusMap[filters.status]);
    if (filters.rating) params.set('r', JIKAN_TO_MAL_WEB_RATING[filters.rating]);
    if (filters.sfw) params.append('genre_ex[]', '12');
    if (filters.genres_exclude) {
      for (const g of filters.genres_exclude.split(',')) {
        if (g.trim()) params.append('genre_ex[]', g.trim());
      }
    }
    if (filters.producers) params.set('p', filters.producers.split(',')[0].trim());
    if (filters.min_score !== undefined) params.set('score', String(Math.floor(filters.min_score)));
    const html = await this.fetchHtml(`/anime.php?${params.toString()}`);
    return parseSearchHtml(html).slice(0, filters.limit);
  }

  async getTopAnime(filter: string, page: number, limit: number): Promise<JikanAnime[]> {
    const limitOffset = (page - 1) * 50;
    const params = new URLSearchParams({ limit: String(limitOffset) });
    if (filter && filter !== 'all') {
      params.set('type', filter);
    }
    const html = await this.fetchHtml(`/topanime.php?${params.toString()}`);
    return parseTopAnimeHtml(html).slice(0, limit);
  }

  async getSeasonalAnime(year?: number, season?: string): Promise<JikanAnime[]> {
    const path = year && season ? `/anime/season/${year}/${season.toLowerCase()}` : '/anime/season';
    const html = await this.fetchHtml(path);
    return parseSeasonalHtml(html, year, season);
  }

  async getMangaById(id: number): Promise<JikanManga> {
    const html = await this.fetchHtml(`/manga/${id}`);
    return parseMangaHtml(html, id);
  }

  async getMangaCharacters(id: number): Promise<JikanCharacterEntry[]> {
    const html = await this.fetchHtml(`/manga/${id}/_/characters`);
    return parseCharactersHtml(html);
  }

  async searchManga(filters: MangaSearchFilters): Promise<JikanManga[]> {
    const statusMap: Record<string, string> = {
      publishing: '1',
      complete: '2',
      upcoming: '3',
      hiatus: '4',
      discontinued: '5',
    };
    const show = (filters.page - 1) * 50;
    const params = new URLSearchParams({ cat: 'manga', show: String(show) });
    if (filters.q) params.set('q', filters.q);
    if (filters.letter) params.set('letter', filters.letter);
    if (filters.status && statusMap[filters.status]) params.set('status', statusMap[filters.status]);
    if (filters.sfw) params.append('genre_ex[]', '12');
    if (filters.genres_exclude) {
      for (const g of filters.genres_exclude.split(',')) {
        if (g.trim()) params.append('genre_ex[]', g.trim());
      }
    }
    if (filters.min_score !== undefined) params.set('score', String(Math.floor(filters.min_score)));
    const html = await this.fetchHtml(`/manga.php?${params.toString()}`);
    return parseMangaSearchHtml(html).slice(0, filters.limit);
  }

  async getTopManga(filter: string, page: number, limit: number): Promise<JikanManga[]> {
    const limitOffset = (page - 1) * 50;
    const params = new URLSearchParams({ limit: String(limitOffset) });
    if (filter && filter !== 'all') {
      params.set('type', filter);
    }
    const html = await this.fetchHtml(`/topmanga.php?${params.toString()}`);
    return parseTopMangaHtml(html).slice(0, limit);
  }

  async getAnimeNews(id: number): Promise<JikanNewsItem[]> {
    const html = await this.fetchHtml(`/anime/${id}/_/news`);
    return parseNewsHtml(html);
  }

  async getMangaNews(id: number): Promise<JikanNewsItem[]> {
    const html = await this.fetchHtml(`/manga/${id}/_/news`);
    return parseNewsHtml(html);
  }

  async getGlobalNews(page: number, limit: number): Promise<JikanNewsItem[]> {
    const html = await this.fetchHtml(`/news?p=${page}`);
    return parseNewsHtml(html).slice(0, limit);
  }

  async getAnimeRelations(id: number): Promise<JikanRelationEntry[]> {
    const html = await this.fetchHtml(`/anime/${id}`);
    return parseRelationsHtml(html);
  }

  async getMangaRelations(id: number): Promise<JikanRelationEntry[]> {
    const html = await this.fetchHtml(`/manga/${id}`);
    return parseRelationsHtml(html);
  }
}
