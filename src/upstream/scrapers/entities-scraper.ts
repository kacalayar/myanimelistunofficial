import * as cheerio from 'cheerio';
import { extractIdFromUrl, MalWebClient, parseNumeric, toAbsoluteMalUrl } from '../mal-web-client.js';

/**
 * Scraper for Entity & Community endpoints:
 * characters, people, producers, magazines, clubs, and users.
 */
export class EntitiesScraper {
  constructor(private readonly web: MalWebClient) {}

  async searchCharacters(q: string, page = 1, limit = 25) {
    const show = (page - 1) * 50;
    const html = await this.web.fetchHtml(`/character.php?q=${encodeURIComponent(q)}&show=${show}`);
    const $ = cheerio.load(html);
    const list: Array<{ mal_id: number; url: string; name: string; images: { jpg: { image_url: string | null } } }> = [];

    $('table tr').each((_, row) => {
      const anchor = $(row).find('td').eq(1).find('a').first();
      const href = anchor.attr('href');
      const id = extractIdFromUrl(href, 'character');
      const name = anchor.text().trim();
      if (!id || !name) return;

      const img = $(row).find('img').attr('data-src') || $(row).find('img').attr('src') || null;
      list.push({ mal_id: id, url: toAbsoluteMalUrl(href), name, images: { jpg: { image_url: img } } });
    });

    return list.slice(0, limit);
  }

  async getCharacterById(id: number) {
    const html = await this.web.fetchHtml(`/character/${id}`);
    const $ = cheerio.load(html);
    const name = $('h2.normal_header').first().text().trim() || $('h1.title-name').first().text().trim();
    const img = $('td.borderClass img').first().attr('data-src') || $('td.borderClass img').first().attr('src') || null;
    const about = $('td[valign="top"]').eq(1).clone();
    about.find('h2, table, div.normal_header').remove();

    return {
      mal_id: id,
      url: toAbsoluteMalUrl(`/character/${id}`),
      images: { jpg: { image_url: img } },
      name,
      about: about.text().trim() || null,
    };
  }

  async getCharacterAppearances(id: number, kind: 'anime' | 'manga') {
    const html = await this.web.fetchHtml(`/character/${id}`);
    const $ = cheerio.load(html);
    const items: Array<{ role: string; entry: { mal_id: number; url: string; title: string } }> = [];

    $(`a[href*="/${kind}/"]`).each((_, a) => {
      const href = $(a).attr('href');
      const entryId = extractIdFromUrl(href, kind);
      const title = $(a).text().trim();
      if (!entryId || !title) return;
      const role = $(a).closest('tr').find('small').text().trim() || 'Main';
      items.push({ role, entry: { mal_id: entryId, url: toAbsoluteMalUrl(href), title } });
    });

    return items;
  }

  async getCharacterVoices(id: number) {
    const html = await this.web.fetchHtml(`/character/${id}`);
    const $ = cheerio.load(html);
    const voices: Array<{ language: string; person: { mal_id: number; url: string; name: string } }> = [];

    $('a[href*="/people/"]').each((_, a) => {
      const href = $(a).attr('href');
      const personId = extractIdFromUrl(href, 'people');
      const name = $(a).text().trim();
      if (!personId || !name) return;
      const language = $(a).closest('tr').find('small').last().text().trim() || 'Japanese';
      voices.push({ language, person: { mal_id: personId, url: toAbsoluteMalUrl(href), name } });
    });

    return voices;
  }

  async getEntityPictures(kind: 'character' | 'people', id: number) {
    const html = await this.web.fetchHtml(`/${kind}/${id}/_/pictures`);
    const $ = cheerio.load(html);
    const pics: Array<{ jpg: { image_url: string } }> = [];
    $('a.js-picture-gallery').each((_, a) => {
      const href = $(a).attr('href');
      if (href) pics.push({ jpg: { image_url: href } });
    });
    return pics;
  }

  async searchPeople(q: string, page = 1, limit = 25) {
    const show = (page - 1) * 50;
    const html = await this.web.fetchHtml(`/people.php?q=${encodeURIComponent(q)}&show=${show}`);
    const $ = cheerio.load(html);
    const list: Array<{ mal_id: number; url: string; name: string; images: { jpg: { image_url: string | null } } }> = [];

    $('table tr').each((_, row) => {
      const anchor = $(row).find('td').eq(1).find('a').first();
      const href = anchor.attr('href');
      const id = extractIdFromUrl(href, 'people');
      const name = anchor.text().trim();
      if (!id || !name) return;
      const img = $(row).find('img').attr('data-src') || $(row).find('img').attr('src') || null;
      list.push({ mal_id: id, url: toAbsoluteMalUrl(href), name, images: { jpg: { image_url: img } } });
    });

    return list.slice(0, limit);
  }

  async getPersonById(id: number) {
    const html = await this.web.fetchHtml(`/people/${id}`);
    const $ = cheerio.load(html);
    const name = $('h1.title-name').first().text().trim();
    const img = $('td.borderClass img').first().attr('data-src') || $('td.borderClass img').first().attr('src') || null;
    const about = $('.people-informantion-more').text().trim() || null;

    return {
      mal_id: id,
      url: toAbsoluteMalUrl(`/people/${id}`),
      images: { jpg: { image_url: img } },
      name,
      about,
    };
  }

  async getPersonWorks(id: number, kind: 'anime' | 'manga') {
    const html = await this.web.fetchHtml(`/people/${id}`);
    const $ = cheerio.load(html);
    const works: Array<{ position: string; entry: { mal_id: number; url: string; title: string } }> = [];

    $(`a[href*="/${kind}/"]`).each((_, a) => {
      const href = $(a).attr('href');
      const entryId = extractIdFromUrl(href, kind);
      const title = $(a).text().trim();
      if (!entryId || !title) return;
      const position = $(a).closest('tr').find('small').text().trim() || 'Staff';
      works.push({ position, entry: { mal_id: entryId, url: toAbsoluteMalUrl(href), title } });
    });

    return works;
  }

  async getPersonVoices(id: number) {
    const html = await this.web.fetchHtml(`/people/${id}`);
    const $ = cheerio.load(html);
    const roles: Array<{
      role: string;
      anime: { mal_id: number; url: string; title: string };
      character: { mal_id: number; url: string; name: string };
    }> = [];

    $('table.js-table-people-character tr').each((_, row) => {
      const animeA = $(row).find('a[href*="/anime/"]').first();
      const charA = $(row).find('a[href*="/character/"]').first();
      const animeId = extractIdFromUrl(animeA.attr('href'), 'anime');
      const charId = extractIdFromUrl(charA.attr('href'), 'character');
      if (!animeId || !charId) return;

      roles.push({
        role: $(row).find('td').last().text().trim() || 'Main',
        anime: { mal_id: animeId, url: toAbsoluteMalUrl(animeA.attr('href')), title: animeA.text().trim() },
        character: { mal_id: charId, url: toAbsoluteMalUrl(charA.attr('href')), name: charA.text().trim() },
      });
    });

    return roles;
  }

  async listProducers(q?: string, limit = 25) {
    const html = await this.web.fetchHtml('/anime/producer');
    const $ = cheerio.load(html);
    const list: Array<{ mal_id: number; url: string; titles: Array<{ type: string; title: string }>; count: number | null }> = [];
    const filter = q?.trim().toLowerCase();

    $('a.genre-name-link').each((_, a) => {
      const href = $(a).attr('href');
      const id = extractIdFromUrl(href, 'anime/producer');
      const raw = $(a).text().trim();
      const match = raw.match(/^(.+?)\s*\(([\d,]+)\)$/);
      const name = match ? match[1].trim() : raw;
      if (!id || !name) return;
      if (filter && !name.toLowerCase().includes(filter)) return;

      list.push({
        mal_id: id,
        url: toAbsoluteMalUrl(href),
        titles: [{ type: 'Default', title: name }],
        count: match ? parseNumeric(match[2]) : null,
      });
    });

    return list.slice(0, limit);
  }

  async getProducerById(id: number) {
    const html = await this.web.fetchHtml(`/anime/producer/${id}`);
    const $ = cheerio.load(html);
    const name = $('h1.title-name').first().text().trim() || `Producer #${id}`;
    const about = $('.company-description').text().trim() || null;
    const external: Array<{ name: string; url: string }> = [];
    $('.external_links a').each((_, a) => {
      const href = $(a).attr('href');
      const label = $(a).text().trim();
      if (href && label) external.push({ name: label, url: href });
    });

    return {
      mal_id: id,
      url: toAbsoluteMalUrl(`/anime/producer/${id}`),
      titles: [{ type: 'Default', title: name }],
      about,
      external,
    };
  }

  async listMagazines(q?: string, limit = 25) {
    const html = await this.web.fetchHtml('/manga/magazine');
    const $ = cheerio.load(html);
    const list: Array<{ mal_id: number; url: string; name: string; count: number | null }> = [];
    const filter = q?.trim().toLowerCase();

    $('a.genre-name-link').each((_, a) => {
      const href = $(a).attr('href');
      const id = extractIdFromUrl(href, 'manga/magazine');
      const raw = $(a).text().trim();
      const match = raw.match(/^(.+?)\s*\(([\d,]+)\)$/);
      const name = match ? match[1].trim() : raw;
      if (!id || !name) return;
      if (filter && !name.toLowerCase().includes(filter)) return;

      list.push({
        mal_id: id,
        url: toAbsoluteMalUrl(href),
        name,
        count: match ? parseNumeric(match[2]) : null,
      });
    });

    return list.slice(0, limit);
  }

  async searchClubs(q?: string, page = 1, limit = 25) {
    const path = q ? `/clubs.php?q=${encodeURIComponent(q)}&p=${page}` : `/clubs.php?p=${page}`;
    const html = await this.web.fetchHtml(path);
    const $ = cheerio.load(html);
    const clubs: Array<{ mal_id: number; url: string; name: string; members: number | null }> = [];

    $('table tr').each((_, row) => {
      const anchor = $(row).find('a.fw-b').first();
      const href = anchor.attr('href');
      const id = parseNumeric(href?.match(/cid=(\d+)/)?.[1]);
      const name = anchor.text().trim();
      if (!id || !name) return;
      const members = parseNumeric($(row).find('td').eq(2).text());
      clubs.push({ mal_id: id, url: toAbsoluteMalUrl(href), name, members });
    });

    return clubs.slice(0, limit);
  }

  async getClubById(id: number) {
    const html = await this.web.fetchHtml(`/clubs.php?cid=${id}`);
    const $ = cheerio.load(html);
    const name = $('h1.h1').first().text().trim() || `Club #${id}`;
    const members = parseNumeric($('.spaceit_pad:contains("Members:")').text());
    return { mal_id: id, url: toAbsoluteMalUrl(`/clubs.php?cid=${id}`), name, members };
  }

  async getClubMembers(id: number, page = 1) {
    const show = (page - 1) * 36;
    const html = await this.web.fetchHtml(`/clubs.php?cid=${id}&action=members&show=${show}`);
    const $ = cheerio.load(html);
    const members: Array<{ username: string; url: string }> = [];
    $('a[href*="/profile/"]').each((_, a) => {
      const username = $(a).text().trim();
      const href = $(a).attr('href');
      if (username && href) members.push({ username, url: toAbsoluteMalUrl(href) });
    });
    return members;
  }

  async getClubStaff(id: number) {
    const html = await this.web.fetchHtml(`/clubs.php?cid=${id}`);
    const $ = cheerio.load(html);
    const staff: Array<{ username: string; url: string }> = [];
    $('a[href*="/profile/"]').each((_, a) => {
      const username = $(a).text().trim();
      const href = $(a).attr('href');
      if (username && href) staff.push({ username, url: toAbsoluteMalUrl(href) });
    });
    return staff;
  }

  async getClubRelations(id: number) {
    const html = await this.web.fetchHtml(`/clubs.php?cid=${id}`);
    const $ = cheerio.load(html);
    const anime: Array<{ mal_id: number; type: string; name: string; url: string }> = [];
    const manga: Array<{ mal_id: number; type: string; name: string; url: string }> = [];
    const characters: Array<{ mal_id: number; type: string; name: string; url: string }> = [];

    $('a[href*="/anime/"]').each((_, a) => {
      const href = $(a).attr('href');
      const aid = extractIdFromUrl(href, 'anime');
      const name = $(a).text().trim();
      if (aid && name) anime.push({ mal_id: aid, type: 'anime', name, url: toAbsoluteMalUrl(href) });
    });
    $('a[href*="/manga/"]').each((_, a) => {
      const href = $(a).attr('href');
      const mid = extractIdFromUrl(href, 'manga');
      const name = $(a).text().trim();
      if (mid && name) manga.push({ mal_id: mid, type: 'manga', name, url: toAbsoluteMalUrl(href) });
    });
    $('a[href*="/character/"]').each((_, a) => {
      const href = $(a).attr('href');
      const cid = extractIdFromUrl(href, 'character');
      const name = $(a).text().trim();
      if (cid && name) characters.push({ mal_id: cid, type: 'character', name, url: toAbsoluteMalUrl(href) });
    });

    return { anime, manga, characters };
  }

  async searchUsers(q: string, page = 1, limit = 25) {
    const show = (page - 1) * 24;
    const html = await this.web.fetchHtml(`/users.php?q=${encodeURIComponent(q)}&show=${show}`);
    const $ = cheerio.load(html);
    const users: Array<{ username: string; url: string; images: { jpg: { image_url: string | null } } }> = [];
    $('td.borderClass a[href*="/profile/"]').each((_, a) => {
      const username = $(a).text().trim();
      const href = $(a).attr('href');
      if (!username || !href) return;
      const img = $(a).closest('td').find('img').attr('data-src') || $(a).closest('td').find('img').attr('src') || null;
      users.push({ username, url: toAbsoluteMalUrl(href), images: { jpg: { image_url: img } } });
    });
    return users.slice(0, limit);
  }

  async getUserProfile(username: string) {
    const html = await this.web.fetchHtml(`/profile/${encodeURIComponent(username)}`);
    const $ = cheerio.load(html);
    const img = $('.user-image img').attr('data-src') || $('.user-image img').attr('src') || null;
    const about = $('.user-profile-about').text().trim() || null;
    const lastOnline = $('.user-status .user-status-data').first().text().trim() || null;

    return {
      username,
      url: toAbsoluteMalUrl(`/profile/${encodeURIComponent(username)}`),
      images: { jpg: { image_url: img } },
      last_online: lastOnline,
      about,
    };
  }

  async getUserList(username: string, kind: 'anime' | 'manga') {
    const html = await this.web.fetchHtml(`/${kind}list/${encodeURIComponent(username)}`);
    const $ = cheerio.load(html);
    const rawItems = $('table.list-table').attr('data-items');
    if (rawItems) {
      try {
        return JSON.parse(rawItems) as unknown[];
      } catch {
        return [];
      }
    }
    return [];
  }

  async getUserFriends(username: string, page = 1) {
    const offset = (page - 1) * 100;
    const html = await this.web.fetchHtml(`/profile/${encodeURIComponent(username)}/friends?offset=${offset}`);
    const $ = cheerio.load(html);
    const friends: Array<{ user: { username: string; url: string } }> = [];
    $('.friendBlock a[href*="/profile/"]').each((_, a) => {
      const name = $(a).text().trim();
      const href = $(a).attr('href');
      if (name && href) friends.push({ user: { username: name, url: toAbsoluteMalUrl(href) } });
    });
    return friends;
  }

  async getUserById(id: number) {
    const { url } = await this.web.fetchWithFinalUrl(`/comments.php?id=${id}`);
    const match = url.match(/\/profile\/([^/?#]+)/);
    const username = match ? decodeURIComponent(match[1]) : `user_${id}`;
    return { mal_id: id, username, url: toAbsoluteMalUrl(`/profile/${username}`) };
  }

  async getUserStatistics(username: string) {
    const html = await this.web.fetchHtml(`/profile/${encodeURIComponent(username)}`);
    const $ = cheerio.load(html);
    const readStat = (sel: string, label: string) => {
      const txt = $(sel).find(`span:contains("${label}")`).parent().text();
      return parseNumeric(txt) ?? 0;
    };
    return {
      anime: {
        days_watched: readStat('.stats.anime', 'Days:'),
        mean_score: readStat('.stats.anime', 'Mean Score:'),
        watching: readStat('.stats.anime', 'Watching'),
        completed: readStat('.stats.anime', 'Completed'),
        on_hold: readStat('.stats.anime', 'On-Hold'),
        dropped: readStat('.stats.anime', 'Dropped'),
        plan_to_watch: readStat('.stats.anime', 'Plan to Watch'),
        total_entries: readStat('.stats.anime', 'Total Entries'),
      },
      manga: {
        days_read: readStat('.stats.manga', 'Days:'),
        mean_score: readStat('.stats.manga', 'Mean Score:'),
        reading: readStat('.stats.manga', 'Reading'),
        completed: readStat('.stats.manga', 'Completed'),
        on_hold: readStat('.stats.manga', 'On-Hold'),
        dropped: readStat('.stats.manga', 'Dropped'),
        plan_to_read: readStat('.stats.manga', 'Plan to Read'),
        total_entries: readStat('.stats.manga', 'Total Entries'),
      },
    };
  }

  async getUserFavorites(username: string) {
    const html = await this.web.fetchHtml(`/profile/${encodeURIComponent(username)}`);
    const $ = cheerio.load(html);
    const collect = (listId: string, segment: string) => {
      const out: Array<{ mal_id: number; url: string; title: string }> = [];
      $(`ul#${listId} li a`).each((_, a) => {
        const href = $(a).attr('href');
        const id = extractIdFromUrl(href, segment);
        const title = $(a).text().trim();
        if (id && title) out.push({ mal_id: id, url: toAbsoluteMalUrl(href), title });
      });
      return out;
    };
    return {
      anime: collect('anime_favorites', 'anime'),
      manga: collect('manga_favorites', 'manga'),
      characters: collect('character_favorites', 'character'),
      people: collect('person_favorites', 'people'),
    };
  }

  async getUserUpdates(username: string) {
    const html = await this.web.fetchHtml(`/profile/${encodeURIComponent(username)}`);
    const $ = cheerio.load(html);
    const updates: Array<{ title: string; url: string; status: string | null }> = [];
    $('.updates.anime .statistics-updates, .updates.manga .statistics-updates').each((_, el) => {
      const a = $(el).find('a').first();
      const title = a.text().trim();
      const href = a.attr('href');
      if (title && href) {
        updates.push({
          title,
          url: toAbsoluteMalUrl(href),
          status: $(el).find('.data').text().trim() || null,
        });
      }
    });
    return updates;
  }

  async getUserHistory(username: string, type?: 'anime' | 'manga') {
    const path = type
      ? `/history/${encodeURIComponent(username)}/${type}`
      : `/history/${encodeURIComponent(username)}`;
    const html = await this.web.fetchHtml(path);
    const $ = cheerio.load(html);
    const history: Array<{ entry: { mal_id: number; type: string; name: string; url: string }; increment: number; date: string }> = [];
    $('table tr').each((_, row) => {
      const a = $(row).find('td').eq(0).find('a').first();
      const href = a.attr('href') ?? '';
      const kind = href.includes('/manga/') ? 'manga' : 'anime';
      const id = extractIdFromUrl(href, kind);
      const name = a.text().trim();
      if (!id || !name) return;
      const inc = parseNumeric($(row).find('td').eq(0).find('strong').text()) ?? 1;
      const date = $(row).find('td').eq(1).text().trim();
      history.push({ entry: { mal_id: id, type: kind, name, url: toAbsoluteMalUrl(href) }, increment: inc, date });
    });
    return history;
  }

  async getUserReviews(username: string, page = 1) {
    const html = await this.web.fetchHtml(`/profile/${encodeURIComponent(username)}/reviews?p=${page}`);
    const $ = cheerio.load(html);
    const items: Array<{ mal_id: number; url: string; review: string; score: number | null }> = [];
    $('.review-element').each((_, el) => {
      const href = $(el).find('.open a').first().attr('href');
      const id = parseNumeric(href?.match(/id=(\d+)/)?.[1]) ?? 0;
      const review = $(el).find('.text').text().trim();
      const score = parseNumeric($(el).find('.rating .num').text());
      if (review) items.push({ mal_id: id, url: toAbsoluteMalUrl(href), review, score });
    });
    return items;
  }

  async getUserRecommendations(username: string, page = 1) {
    const html = await this.web.fetchHtml(`/profile/${encodeURIComponent(username)}/recommendations?p=${page}`);
    const $ = cheerio.load(html);
    const items: Array<{ content: string }> = [];
    $('.recommendations-user-recs-text').each((_, el) => {
      const content = $(el).text().trim();
      if (content) items.push({ content });
    });
    return items;
  }

  async getUserClubs(username: string) {
    const html = await this.web.fetchHtml(`/profile/${encodeURIComponent(username)}/clubs`);
    const $ = cheerio.load(html);
    const clubs: Array<{ mal_id: number; name: string; url: string }> = [];
    $('a[href*="clubs.php?cid="]').each((_, a) => {
      const href = $(a).attr('href');
      const id = parseNumeric(href?.match(/cid=(\d+)/)?.[1]);
      const name = $(a).text().trim();
      if (id && name) clubs.push({ mal_id: id, name, url: toAbsoluteMalUrl(href) });
    });
    return clubs;
  }
}
