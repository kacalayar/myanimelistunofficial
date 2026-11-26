import { describe, expect, it } from 'vitest';
import {
  mapMalApiAnimeToJikan,
  mapMalApiMangaToJikan,
  mapMalApiRelationsToJikan,
} from '../src/mappers/jikan-v4.js';
import { filterAnimeItems } from '../src/types/search.js';
import {
  parseAnimeHtml,
  parseCharactersHtml,
  parseMangaHtml,
  parseNewsHtml,
  parseRelationsHtml,
  parseTopAnimeHtml,
  parseTopMangaHtml,
} from '../src/upstream/mal-scraper.js';

describe('mapMalApiAnimeToJikan', () => {
  it('normalizes MAL API v2 anime payload into Jikan v4 format', () => {
    const mapped = mapMalApiAnimeToJikan({
      id: 52991,
      title: 'Sousou no Frieren',
      main_picture: {
        medium: 'https://cdn.myanimelist.net/images/anime/1015/138006.jpg',
        large: 'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
      },
      alternative_titles: {
        en: "Frieren: Beyond Journey's End",
        ja: '葬送のフリーレン',
      },
      media_type: 'tv',
      status: 'finished_airing',
      mean: 9.31,
      rank: 1,
      num_episodes: 28,
      average_episode_duration: 1440,
      genres: [{ id: 2, name: 'Adventure' }],
      studios: [{ id: 11, name: 'Madhouse' }],
    });

    expect(mapped.mal_id).toBe(52991);
    expect(mapped.title).toBe('Sousou no Frieren');
    expect(mapped.title_english).toBe("Frieren: Beyond Journey's End");
    expect(mapped.type).toBe('TV');
    expect(mapped.status).toBe('Finished Airing');
    expect(mapped.duration).toBe('24 min per ep');
    expect(mapped.genres[0].name).toBe('Adventure');
    expect(mapped.studios[0].name).toBe('Madhouse');
    expect(mapped.images.webp?.large_image_url).toContain('.webp');
    expect(mapped.approved).toBe(true);
    expect(mapped.aired.prop).toBeDefined();
  });
});

describe('MalScraper HTML parsers', () => {
  it('parses anime detail HTML fixture', () => {
    const html = `
      <html>
        <body>
          <h1 class="title-name">Cowboy Bebop</h1>
          <p class="title-english">Cowboy Bebop</p>
          <img itemprop="image" data-src="https://cdn.myanimelist.net/images/anime/4/19644.jpg" />
          <div class="score-label">8.75</div>
          <span itemprop="ratingCount">950000</span>
          <span class="numbers ranked"><strong>#45</strong></span>
          <span class="numbers popularity"><strong>#43</strong></span>
          <span class="numbers members"><strong>1,850,000</strong></span>
          <p itemprop="description">Space bounty hunters.</p>
          <div class="spaceit_pad"><span class="dark_text">Type:</span> TV</div>
          <div class="spaceit_pad"><span class="dark_text">Episodes:</span> 26</div>
          <div class="spaceit_pad"><span class="dark_text">Status:</span> Finished Airing</div>
          <div class="spaceit_pad"><span class="dark_text">Studios:</span> <a href="/anime/producer/14/Sunrise">Sunrise</a></div>
          <div class="spaceit_pad"><span class="dark_text">Genres:</span> <a href="/anime/genre/1/Action">Action</a></div>
        </body>
      </html>
    `;

    const anime = parseAnimeHtml(html, 1);
    expect(anime.mal_id).toBe(1);
    expect(anime.title).toBe('Cowboy Bebop');
    expect(anime.score).toBe(8.75);
    expect(anime.rank).toBe(45);
    expect(anime.episodes).toBe(26);
    expect(anime.studios[0]).toMatchObject({ mal_id: 14, name: 'Sunrise' });
    expect(anime.genres[0]).toMatchObject({ mal_id: 1, name: 'Action' });
  });

  it('parses top anime HTML fixture', () => {
    const html = `
      <table>
        <tr class="ranking-list">
          <td class="rank"><span class="lightLink top-anime-rank-text">1</span></td>
          <td class="title">
            <img data-src="https://cdn.myanimelist.net/images/anime/1015/138006.jpg" />
            <h3 class="anime_ranking_h3"><a href="https://myanimelist.net/anime/52991/Sousou_no_Frieren">Sousou no Frieren</a></h3>
            <div class="information">TV (28 eps)\nSep 2023 - Mar 2024\n1,000,000 members</div>
          </td>
          <td class="score"><span class="score-label">9.31</span></td>
        </tr>
      </table>
    `;

    const items = parseTopAnimeHtml(html);
    expect(items).toHaveLength(1);
    expect(items[0].mal_id).toBe(52991);
    expect(items[0].rank).toBe(1);
    expect(items[0].score).toBe(9.31);
    expect(items[0].episodes).toBe(28);
  });

  it('parses characters HTML fixture', () => {
    const html = `
      <table class="js-anime-character-table">
        <tr>
          <td><img data-src="https://cdn.myanimelist.net/images/characters/4/50197.jpg" /></td>
          <td>
            <a href="https://myanimelist.net/character/1/Spike_Spiegel">Spike Spiegel</a>
            <div class="spaceit_pad"></div>
            <div class="spaceit_pad">Main</div>
          </td>
          <td>
            <table>
              <tr>
                <td>
                  <a href="https://myanimelist.net/people/11/Kouichi_Yamadera">Yamadera, Kouichi</a>
                  <small>Japanese</small>
                </td>
                <td><img data-src="https://cdn.myanimelist.net/images/voiceactors/2/73612.jpg" /></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;

    const chars = parseCharactersHtml(html);
    expect(chars).toHaveLength(1);
    expect(chars[0].character.name).toBe('Spike Spiegel');
    expect(chars[0].role).toBe('Main');
    expect(chars[0].voice_actors[0].person.name).toBe('Yamadera, Kouichi');
    expect(chars[0].voice_actors[0].language).toBe('Japanese');
  });

  it('normalizes MAL API v2 manga payload and parses manga HTML fixtures', () => {
    const mapped = mapMalApiMangaToJikan({
      id: 2,
      title: 'Berserk',
      media_type: 'manga',
      status: 'currently_publishing',
      mean: 9.47,
      rank: 1,
      num_volumes: 42,
      num_chapters: 380,
      authors: [{ node: { id: 1868, first_name: 'Kentarou', last_name: 'Miura' }, role: 'Story & Art' }],
      genres: [{ id: 1, name: 'Action' }],
    });

    expect(mapped.mal_id).toBe(2);
    expect(mapped.type).toBe('Manga');
    expect(mapped.publishing).toBe(true);
    expect(mapped.authors[0].name).toBe('Miura, Kentarou');

    const html = `
      <html>
        <body>
          <span itemprop="name">Berserk</span>
          <div class="score-label">9.47</div>
          <span class="numbers ranked"><strong>#1</strong></span>
          <div class="spaceit_pad"><span class="dark_text">Type:</span> Manga</div>
          <div class="spaceit_pad"><span class="dark_text">Volumes:</span> 42</div>
          <div class="spaceit_pad"><span class="dark_text">Chapters:</span> 380</div>
          <div class="spaceit_pad"><span class="dark_text">Status:</span> Publishing</div>
          <div class="spaceit_pad"><span class="dark_text">Authors:</span> <a href="/people/1868/Kentarou_Miura">Miura, Kentarou</a></div>
        </body>
      </html>
    `;

    const parsed = parseMangaHtml(html, 2);
    expect(parsed.title).toBe('Berserk');
    expect(parsed.volumes).toBe(42);
    expect(parsed.chapters).toBe(380);
    expect(parsed.publishing).toBe(true);
    expect(parsed.authors[0]).toMatchObject({ mal_id: 1868, name: 'Miura, Kentarou' });

    const topHtml = `
      <table>
        <tr class="ranking-list">
          <td class="rank"><span>1</span></td>
          <td>
            <h3 class="manga_h3"><a href="https://myanimelist.net/manga/2/Berserk">Berserk</a></h3>
            <div class="information">Manga (42 vols)\nAug 1989 -\n700,000 members</div>
          </td>
          <td class="score"><span class="score-label">9.47</span></td>
        </tr>
      </table>
    `;

    const topManga = parseTopMangaHtml(topHtml);
    expect(topManga).toHaveLength(1);
    expect(topManga[0].mal_id).toBe(2);
    expect(topManga[0].volumes).toBe(42);
  });

  it('parses news HTML fixture', () => {
    const newsHtml = `
      <div class="news-unit clearfix rect">
        <a class="image-link" href="https://myanimelist.net/news/71234567">
          <img data-src="https://cdn.myanimelist.net/s/common/uploaded_files/news.jpg" />
        </a>
        <div class="news-unit-right">
          <p class="title"><a href="https://myanimelist.net/news/71234567">New Anime Announced</a></p>
          <div class="text">A brand new adaptation has been announced for 2027.</div>
          <div class="information">
            <p class="info di-ib">
              Nov 25, 2026 10:00 AM by <a href="https://myanimelist.net/profile/MAL_Editor">MAL_Editor</a>
              | <a class="comment" href="https://myanimelist.net/forum/?topicid=999">42 comments</a>
            </p>
          </div>
        </div>
      </div>
    `;

    const news = parseNewsHtml(newsHtml);
    expect(news).toHaveLength(1);
    expect(news[0].mal_id).toBe(71234567);
    expect(news[0].title).toBe('New Anime Announced');
    expect(news[0].author_username).toBe('MAL_Editor');
    expect(news[0].comments).toBe(42);
    expect(news[0].date).toBe('Nov 25, 2026 10:00 AM');
  });

  it('maps MAL API v2 relations and parses relations HTML fixture', () => {
    const mapped = mapMalApiRelationsToJikan(
      [{ node: { id: 5, title: 'Cowboy Bebop: Tengoku no Tobira' }, relation_type: 'side_story', relation_type_formatted: 'Side Story' }],
      [{ node: { id: 173, title: 'Cowboy Bebop' }, relation_type: 'adaptation', relation_type_formatted: 'Adaptation' }],
    );

    expect(mapped).toHaveLength(2);
    expect(mapped[0].relation).toBe('Side Story');
    expect(mapped[0].entry[0]).toMatchObject({ mal_id: 5, type: 'anime' });
    expect(mapped[1].relation).toBe('Adaptation');
    expect(mapped[1].entry[0]).toMatchObject({ mal_id: 173, type: 'manga' });

    const html = `
      <table class="anime_detail_related_anime">
        <tr>
          <td>Adaptation:</td>
          <td><a href="/manga/173/Cowboy_Bebop">Cowboy Bebop</a></td>
        </tr>
        <tr>
          <td>Side Story:</td>
          <td><a href="/anime/5/Cowboy_Bebop__Tengoku_no_Tobira">Cowboy Bebop: Tengoku no Tobira</a></td>
        </tr>
      </table>
    `;

    const parsed = parseRelationsHtml(html);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].relation).toBe('Adaptation');
    expect(parsed[0].entry[0]).toMatchObject({ mal_id: 173, type: 'manga' });
    expect(parsed[1].relation).toBe('Side Story');
    expect(parsed[1].entry[0]).toMatchObject({ mal_id: 5, type: 'anime' });
  });

  it('filters anime items by rating, sfw, and min_score', () => {
    const items = [
      { type: 'TV', status: 'Finished Airing', score: 9.1, rating: 'pg_13', genres: [{ name: 'Adventure' }] },
      { type: 'OVA', status: 'Finished Airing', score: 6.5, rating: 'rx', genres: [{ name: 'Hentai' }] },
      { type: 'TV', status: 'Finished Airing', score: 7.2, rating: 'r', genres: [{ name: 'Action' }] },
    ];

    const sfwPg13 = filterAnimeItems(items, { page: 1, limit: 25, sfw: true, rating: 'pg13', min_score: 8 });
    expect(sfwPg13).toHaveLength(1);
    expect(sfwPg13[0].rating).toBe('pg_13');

    const sfwOnly = filterAnimeItems(items, { page: 1, limit: 25, sfw: true });
    expect(sfwOnly).toHaveLength(2);
    expect(sfwOnly.some((i) => i.rating === 'rx')).toBe(false);
  });
});
