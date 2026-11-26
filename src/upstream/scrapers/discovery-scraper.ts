import * as cheerio from 'cheerio';
import { extractIdFromUrl, MalWebClient, parseNumeric, toAbsoluteMalUrl } from '../mal-web-client.js';
import { parseSeasonalHtml } from '../mal-scraper.js';

/**
 * Scraper for Discovery & Listing endpoints:
 * schedules, genres, season archives, upcoming seasons, top characters/people,
 * recent reviews/recommendations, watch episodes/promos, and random entries.
 */
export class DiscoveryScraper {
  constructor(private readonly web: MalWebClient) {}

  async getSchedules(day?: string) {
    const html = await this.web.fetchHtml('/anime/season/schedule');
    const $ = cheerio.load(html);
    const targetDay = day?.toLowerCase();
    const results: ReturnType<typeof parseSeasonalHtml> = [];

    $('.seasonal-anime-list').each((_, section) => {
      const heading = $(section).find('.anime-header').first().text().trim().toLowerCase();
      if (targetDay && heading !== targetDay) return;
      const sectionHtml = $(section).html() ?? '';
      results.push(...parseSeasonalHtml(sectionHtml));
    });

    return results;
  }

  async getGenres(kind: 'anime' | 'manga') {
    const html = await this.web.fetchHtml(`/${kind}.php`);
    const $ = cheerio.load(html);
    const genres: Array<{ mal_id: number; name: string; url: string; count: number | null }> = [];
    const seen = new Set<number>();

    $(`a[href*="/${kind}/genre/"]`).each((_, a) => {
      const href = $(a).attr('href');
      const id = extractIdFromUrl(href, `${kind}/genre`);
      if (!id || seen.has(id)) return;
      seen.add(id);

      const raw = $(a).text().trim();
      const match = raw.match(/^(.+?)\s*\(([\d,]+)\)$/);
      const name = match ? match[1].trim() : raw;
      const count = match ? parseNumeric(match[2]) : null;
      if (name) {
        genres.push({ mal_id: id, name, url: toAbsoluteMalUrl(href), count });
      }
    });

    return genres;
  }

  async getSeasonsList() {
    const html = await this.web.fetchHtml('/anime/season/archive');
    const $ = cheerio.load(html);
    const byYear = new Map<number, Set<string>>();

    $('table.anime-seasonal-byyear a').each((_, a) => {
      const href = $(a).attr('href') ?? '';
      const match = href.match(/\/anime\/season\/(\d{4})\/(winter|spring|summer|fall)/i);
      if (!match) return;
      const year = Number.parseInt(match[1], 10);
      const season = match[2].toLowerCase();
      const set = byYear.get(year) ?? new Set<string>();
      set.add(season);
      byYear.set(year, set);
    });

    return Array.from(byYear.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, seasons]) => ({ year, seasons: Array.from(seasons) }));
  }

  async getUpcomingSeason() {
    const html = await this.web.fetchHtml('/anime/season/later');
    return parseSeasonalHtml(html);
  }

  async getTopCharacters(page = 1, limit = 25) {
    const offset = (page - 1) * 50;
    const html = await this.web.fetchHtml(`/character.php?limit=${offset}`);
    const $ = cheerio.load(html);
    const items: Array<{
      mal_id: number;
      url: string;
      images: { jpg: { image_url: string | null } };
      name: string;
      name_kanji: string | null;
      favorites: number | null;
    }> = [];

    $('tr.ranking-list').each((_, row) => {
      const anchor = $(row).find('td.people a').first();
      const href = anchor.attr('href');
      const id = extractIdFromUrl(href, 'character');
      const name = anchor.text().trim();
      if (!id || !name) return;

      const img = $(row).find('img').attr('data-src') || $(row).find('img').attr('src') || null;
      const kanji = $(row).find('td.people span.fs12').text().replace(/[()]/g, '').trim() || null;
      const favorites = parseNumeric($(row).find('td.favorites').text());

      items.push({
        mal_id: id,
        url: toAbsoluteMalUrl(href),
        images: { jpg: { image_url: img } },
        name,
        name_kanji: kanji,
        favorites,
      });
    });

    return items.slice(0, limit);
  }

  async getTopPeople(page = 1, limit = 25) {
    const offset = (page - 1) * 50;
    const html = await this.web.fetchHtml(`/people.php?limit=${offset}`);
    const $ = cheerio.load(html);
    const items: Array<{
      mal_id: number;
      url: string;
      images: { jpg: { image_url: string | null } };
      name: string;
      favorites: number | null;
    }> = [];

    $('tr.ranking-list').each((_, row) => {
      const anchor = $(row).find('td.people a').first();
      const href = anchor.attr('href');
      const id = extractIdFromUrl(href, 'people');
      const name = anchor.text().trim();
      if (!id || !name) return;

      const img = $(row).find('img').attr('data-src') || $(row).find('img').attr('src') || null;
      const favorites = parseNumeric($(row).find('td.favorites').text());

      items.push({
        mal_id: id,
        url: toAbsoluteMalUrl(href),
        images: { jpg: { image_url: img } },
        name,
        favorites,
      });
    });

    return items.slice(0, limit);
  }

  async getRecentReviews(kind: 'anime' | 'manga', page = 1) {
    const html = await this.web.fetchHtml(`/reviews.php?t=${kind}&p=${page}`);
    const $ = cheerio.load(html);
    const reviews: Array<{
      mal_id: number;
      url: string;
      type: string;
      date: string | null;
      review: string;
      score: number | null;
      user: { username: string | null; url: string | null };
      entry: { mal_id: number | null; title: string; url: string | null };
    }> = [];

    $('.review-element').each((_, el) => {
      const entryAnchor = $(el).find('a.title').first();
      const entryHref = entryAnchor.attr('href');
      const entryTitle = entryAnchor.text().trim();
      const entryId = extractIdFromUrl(entryHref, kind);

      const userAnchor = $(el).find('.username a').first();
      const reviewAnchor = $(el).find('.open a').first();
      const reviewHref = reviewAnchor.attr('href');
      const reviewId = parseNumeric(reviewHref?.match(/id=(\d+)/)?.[1]) ?? 0;

      if (!entryTitle) return;

      reviews.push({
        mal_id: reviewId,
        url: toAbsoluteMalUrl(reviewHref),
        type: kind,
        date: $(el).find('.update_at').text().trim() || null,
        review: $(el).find('.text').text().trim(),
        score: parseNumeric($(el).find('.rating .num').text()),
        user: {
          username: userAnchor.text().trim() || null,
          url: userAnchor.attr('href') ? toAbsoluteMalUrl(userAnchor.attr('href')) : null,
        },
        entry: {
          mal_id: entryId,
          title: entryTitle,
          url: entryHref ? toAbsoluteMalUrl(entryHref) : null,
        },
      });
    });

    return reviews;
  }

  async getRecentRecommendations(kind: 'anime' | 'manga', page = 1) {
    const html = await this.web.fetchHtml(`/recommendations.php?s=recentrecs&t=${kind}&p=${page}`);
    const $ = cheerio.load(html);
    const recs: Array<{
      mal_id: string;
      entry: Array<{ mal_id: number; url: string; title: string; images: { jpg: { image_url: string | null } } }>;
      content: string;
      date: string | null;
      user: { username: string | null; url: string | null };
    }> = [];

    $('.spaceit.borderClass').each((_, el) => {
      const anchors = $(el).find('a strong').parent();
      if (anchors.length < 2) return;
      const first = anchors.eq(0);
      const second = anchors.eq(1);
      const id1 = extractIdFromUrl(first.attr('href'), kind);
      const id2 = extractIdFromUrl(second.attr('href'), kind);
      if (!id1 || !id2) return;

      const imgs = $(el).find('img');
      const content = $(el).find('.recommendations-user-recs-text').text().trim();
      const userAnchor = $(el).find('a[href*="/profile/"]').first();

      recs.push({
        mal_id: `${id1}-${id2}`,
        entry: [
          {
            mal_id: id1,
            url: toAbsoluteMalUrl(first.attr('href')),
            title: first.text().trim(),
            images: { jpg: { image_url: imgs.eq(0).attr('data-src') || imgs.eq(0).attr('src') || null } },
          },
          {
            mal_id: id2,
            url: toAbsoluteMalUrl(second.attr('href')),
            title: second.text().trim(),
            images: { jpg: { image_url: imgs.eq(1).attr('data-src') || imgs.eq(1).attr('src') || null } },
          },
        ],
        content,
        date: null,
        user: {
          username: userAnchor.text().trim() || null,
          url: userAnchor.attr('href') ? toAbsoluteMalUrl(userAnchor.attr('href')) : null,
        },
      });
    });

    return recs;
  }

  async getWatchEpisodes(popular = false) {
    const html = await this.web.fetchHtml(popular ? '/watch/episode/popular' : '/watch/episode');
    const $ = cheerio.load(html);
    const items: Array<{
      entry: { mal_id: number; url: string; title: string; images: { jpg: { image_url: string | null } } };
      episodes: Array<{ mal_id: string; url: string; title: string; premium: boolean }>;
    }> = [];

    $('.video-list-outer').each((_, el) => {
      const titleAnchor = $(el).find('.video-info-title a').first();
      const href = titleAnchor.attr('href');
      const id = extractIdFromUrl(href, 'anime');
      const title = titleAnchor.text().trim();
      if (!id || !title) return;

      const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || null;
      const eps: Array<{ mal_id: string; url: string; title: string; premium: boolean }> = [];
      $(el).find('.episode-title a').each((__, epA) => {
        const epHref = $(epA).attr('href') || '';
        eps.push({
          mal_id: epHref.split('/').pop() || '1',
          url: toAbsoluteMalUrl(epHref),
          title: $(epA).text().trim(),
          premium: false,
        });
      });

      items.push({
        entry: { mal_id: id, url: toAbsoluteMalUrl(href), title, images: { jpg: { image_url: img } } },
        episodes: eps,
      });
    });

    return items;
  }

  async getWatchPromos() {
    const html = await this.web.fetchHtml('/watch/promotion');
    const $ = cheerio.load(html);
    const promos: Array<{
      title: string;
      entry: { mal_id: number; url: string; title: string };
      trailer: { url: string | null; embed_url: string | null };
    }> = [];

    $('.video-list-outer').each((_, el) => {
      const animeAnchor = $(el).find('.video-info-title a').first();
      const href = animeAnchor.attr('href');
      const id = extractIdFromUrl(href, 'anime');
      const animeTitle = animeAnchor.text().trim();
      if (!id || !animeTitle) return;

      const videoHref = $(el).find('a.iframe').attr('href') || null;
      const promoTitle = $(el).find('.info-container .title').text().trim() || 'PV';
      promos.push({
        title: promoTitle,
        entry: { mal_id: id, url: toAbsoluteMalUrl(href), title: animeTitle },
        trailer: { url: videoHref, embed_url: videoHref },
      });
    });

    return promos;
  }

  async getRandomResource(type: 'anime' | 'manga' | 'characters' | 'people' | 'users') {
    const map: Record<typeof type, string> = {
      anime: '/random/anime',
      manga: '/random/manga',
      characters: '/random/character',
      people: '/random/person',
      users: '/random/user',
    };
    const { url, html } = await this.web.fetchWithFinalUrl(map[type]);
    const $ = cheerio.load(html);
    const title =
      $('h1.title-name').first().text().trim() ||
      $('h1.h1').first().text().trim() ||
      $('title').text().replace(' - MyAnimeList.net', '').trim();
    const id =
      extractIdFromUrl(url, type === 'characters' ? 'character' : type === 'people' ? 'people' : type) ??
      null;

    return { mal_id: id, url, title };
  }
}
