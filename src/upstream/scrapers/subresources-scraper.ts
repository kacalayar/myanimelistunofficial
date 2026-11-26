import * as cheerio from 'cheerio';
import type { JikanNamedEntity } from '../../types/jikan.js';
import { extractIdFromUrl, MalWebClient, parseNumeric, toAbsoluteMalUrl } from '../mal-web-client.js';

/**
 * Scraper for Anime & Manga sub-resources (episodes, staff, themes, videos,
 * pictures, statistics, recommendations, forum, moreinfo, external, streaming).
 */
export class SubresourcesScraper {
  constructor(private readonly web: MalWebClient) {}

  async getAnimeStaff(id: number) {
    const html = await this.web.fetchHtml(`/anime/${id}/_/characters`);
    const $ = cheerio.load(html);
    const staff: Array<{
      person: { mal_id: number; url: string; images: { jpg: { image_url: string | null } }; name: string };
      positions: string[];
    }> = [];

    $('div.detail-characters-list').last().find('table').each((_, table) => {
      const anchor = $(table).find('td').eq(1).find('a').first();
      const href = anchor.attr('href');
      const personId = extractIdFromUrl(href, 'people');
      const name = anchor.text().trim();
      if (!personId || !name) return;

      const img = $(table).find('img').attr('data-src') || $(table).find('img').attr('src') || null;
      const positionsText = $(table).find('td').eq(1).find('small').text().trim();
      const positions = positionsText ? positionsText.split(',').map((s) => s.trim()).filter(Boolean) : [];

      staff.push({
        person: {
          mal_id: personId,
          url: toAbsoluteMalUrl(href),
          images: { jpg: { image_url: img } },
          name,
        },
        positions,
      });
    });

    return staff;
  }

  async getAnimeEpisodes(id: number, page = 1) {
    const offset = (page - 1) * 100;
    const html = await this.web.fetchHtml(`/anime/${id}/_/episode?offset=${offset}`);
    const $ = cheerio.load(html);
    const episodes: Array<{
      mal_id: number;
      url: string | null;
      title: string;
      title_japanese: string | null;
      title_romanji: string | null;
      aired: string | null;
      score: number | null;
      filler: boolean;
      recap: boolean;
    }> = [];

    $('tr.episode-list-data').each((_, row) => {
      const epNum = parseNumeric($(row).find('td.episode-number').text());
      const anchor = $(row).find('td.episode-title a').first();
      const title = anchor.text().trim();
      if (!epNum || !title) return;

      const href = anchor.attr('href');
      const romanji = $(row).find('td.episode-title span.di-ib').text().trim() || null;
      const aired = $(row).find('td.episode-aired').text().trim() || null;
      const score = parseNumeric($(row).find('td.episode-poll .average').text());
      const tagsText = $(row).find('td.episode-title').text();

      episodes.push({
        mal_id: epNum,
        url: href ? toAbsoluteMalUrl(href) : null,
        title,
        title_japanese: null,
        title_romanji: romanji,
        aired,
        score,
        filler: tagsText.includes('Filler'),
        recap: tagsText.includes('Recap'),
      });
    });

    return episodes;
  }

  async getAnimeEpisodeById(id: number, episode: number) {
    const html = await this.web.fetchHtml(`/anime/${id}/_/episode/${episode}`);
    const $ = cheerio.load(html);
    const title = $('h2.fs18').first().text().trim() || `Episode ${episode}`;
    const synopsis = $('div.pt8.pb8').first().text().trim() || null;
    return {
      mal_id: episode,
      url: toAbsoluteMalUrl(`/anime/${id}/_/episode/${episode}`),
      title,
      synopsis,
    };
  }

  async getAnimeThemes(id: number) {
    const html = await this.web.fetchHtml(`/anime/${id}`);
    const $ = cheerio.load(html);
    const openings: string[] = [];
    const endings: string[] = [];

    $('.theme-songs.opnening table tr td').each((_, td) => {
      const text = $(td).text().replace(/\s+/g, ' ').trim();
      if (text && !text.startsWith('No opening')) openings.push(text);
    });
    $('.theme-songs.ending table tr td').each((_, td) => {
      const text = $(td).text().replace(/\s+/g, ' ').trim();
      if (text && !text.startsWith('No ending')) endings.push(text);
    });

    return { openings, endings };
  }

  async getAnimeVideos(id: number) {
    const html = await this.web.fetchHtml(`/anime/${id}/_/video`);
    const $ = cheerio.load(html);
    const promo: Array<{ title: string; trailer: { youtube_id: string | null; url: string | null; embed_url: string | null } }> = [];

    $('.video-list-outer .video-list').each((_, el) => {
      const title = $(el).find('.info-container .title').text().trim() || 'Promo';
      const href = $(el).find('a.iframe').attr('href') || null;
      const ytMatch = href?.match(/youtube\.com\/embed\/([^?&]+)/);
      promo.push({
        title,
        trailer: {
          youtube_id: ytMatch ? ytMatch[1] : null,
          url: ytMatch ? `https://www.youtube.com/watch?v=${ytMatch[1]}` : href,
          embed_url: href,
        },
      });
    });

    return { promo, episodes: [], music_videos: [] };
  }

  async getPictures(kind: 'anime' | 'manga', id: number) {
    const html = await this.web.fetchHtml(`/${kind}/${id}/_/pics`);
    const $ = cheerio.load(html);
    const pics: Array<{ jpg: { image_url: string; large_image_url: string } }> = [];

    $('a.js-picture-gallery').each((_, a) => {
      const href = $(a).attr('href');
      if (href) {
        pics.push({ jpg: { image_url: href, large_image_url: href } });
      }
    });

    return pics;
  }

  async getStatistics(kind: 'anime' | 'manga', id: number) {
    const html = await this.web.fetchHtml(`/${kind}/${id}/_/stats`);
    const $ = cheerio.load(html);

    const readStat = (label: string): number => {
      let val = 0;
      $('.spaceit_pad').each((_, el) => {
        const text = $(el).text();
        if (text.includes(label)) {
          val = parseNumeric(text) ?? 0;
        }
      });
      return val;
    };

    const scores: Array<{ score: number; votes: number; percentage: number }> = [];
    $('table.score-stats tr').each((_, row) => {
      const score = parseNumeric($(row).find('td').eq(0).text());
      const barText = $(row).find('td').eq(1).text();
      const pctMatch = barText.match(/([\d.]+)%/);
      const votesMatch = barText.match(/\((\d+)\s+votes?\)/i);
      if (score) {
        scores.push({
          score,
          votes: votesMatch ? Number.parseInt(votesMatch[1], 10) : 0,
          percentage: pctMatch ? Number.parseFloat(pctMatch[1]) : 0,
        });
      }
    });

    const summary =
      kind === 'anime'
        ? {
            watching: readStat('Watching:'),
            completed: readStat('Completed:'),
            on_hold: readStat('On-Hold:'),
            dropped: readStat('Dropped:'),
            plan_to_watch: readStat('Plan to Watch:'),
            total: readStat('Total:'),
          }
        : {
            reading: readStat('Reading:'),
            completed: readStat('Completed:'),
            on_hold: readStat('On-Hold:'),
            dropped: readStat('Dropped:'),
            plan_to_read: readStat('Plan to Read:'),
            total: readStat('Total:'),
          };

    return { ...summary, scores };
  }

  async getRecommendations(kind: 'anime' | 'manga', id: number) {
    const html = await this.web.fetchHtml(`/${kind}/${id}/_/userrecs`);
    const $ = cheerio.load(html);
    const recs: Array<{
      entry: { mal_id: number; url: string; images: { jpg: { image_url: string | null } }; title: string };
      url: string;
      votes: number;
    }> = [];

    $('.borderClass .picSurround').each((_, pic) => {
      const container = $(pic).closest('table');
      const anchor = container.find('td').eq(1).find('a strong').first().parent();
      const href = anchor.attr('href');
      const recId = extractIdFromUrl(href, kind);
      const title = anchor.text().trim();
      if (!recId || !title) return;

      const img = $(pic).find('img').attr('data-src') || $(pic).find('img').attr('src') || null;
      const votes = parseNumeric(container.find('a.js-similar-recommendations-button strong').text()) ?? 1;

      recs.push({
        entry: {
          mal_id: recId,
          url: toAbsoluteMalUrl(href),
          images: { jpg: { image_url: img } },
          title,
        },
        url: toAbsoluteMalUrl(href),
        votes,
      });
    });

    return recs;
  }

  async getForum(kind: 'anime' | 'manga', id: number) {
    const html = await this.web.fetchHtml(`/${kind}/${id}/_/forum`);
    const $ = cheerio.load(html);
    const topics: Array<{
      mal_id: number;
      url: string;
      title: string;
      date: string | null;
      author_username: string | null;
      comments: number | null;
    }> = [];

    $('table#forumTopics tr').each((idx, row) => {
      if (idx === 0) return;
      const anchor = $(row).find('td').eq(1).find('a').first();
      const href = anchor.attr('href');
      const title = anchor.text().trim();
      const topicMatch = href?.match(/topicid=(\d+)/);
      if (!topicMatch || !title) return;

      const author = $(row).find('td').eq(1).find('a').eq(1).text().trim() || null;
      const date = $(row).find('td').eq(1).find('span.lightLink').text().trim() || null;
      const comments = parseNumeric($(row).find('td').eq(2).text());

      topics.push({
        mal_id: Number.parseInt(topicMatch[1], 10),
        url: toAbsoluteMalUrl(href),
        title,
        date,
        author_username: author,
        comments,
      });
    });

    return topics;
  }

  async getMoreInfo(kind: 'anime' | 'manga', id: number) {
    const html = await this.web.fetchHtml(`/${kind}/${id}/_/moreinfo`);
    const $ = cheerio.load(html);
    const text = $('h2:contains("More Info")').parent().clone();
    text.find('h2').remove();
    return { moreinfo: text.text().trim() || null };
  }

  async getExternalLinks(kind: 'anime' | 'manga', id: number): Promise<Array<{ name: string; url: string }>> {
    const html = await this.web.fetchHtml(`/${kind}/${id}`);
    const $ = cheerio.load(html);
    const links: Array<{ name: string; url: string }> = [];
    $('.external_links a.link').each((_, a) => {
      const url = $(a).attr('href');
      const name = $(a).find('.caption').text().trim() || $(a).text().trim();
      if (url && name) links.push({ name, url });
    });
    return links;
  }

  async getStreamingLinks(id: number): Promise<Array<{ name: string; url: string }>> {
    const html = await this.web.fetchHtml(`/anime/${id}`);
    const $ = cheerio.load(html);
    const links: Array<{ name: string; url: string }> = [];
    $('.broadcasts a.link').each((_, a) => {
      const url = $(a).attr('href');
      const name = $(a).find('.caption').text().trim() || $(a).text().trim();
      if (url && name) links.push({ name, url });
    });
    return links;
  }
}

export type { JikanNamedEntity };
