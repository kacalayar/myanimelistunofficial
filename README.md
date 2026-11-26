# MAL Unofficial API

A fast, timeout-resistant **Unofficial MyAnimeList REST API** (compatible with **Jikan v4** response shapes), built with **Node.js**, **TypeScript**, **Hono**, **SQLite SWR Caching**, and a built-in **Web Dashboard UI**.

---

## Why This Exists

Public Jikan.moe instances frequently experience timeouts and `429 Too Many Requests` errors due to shared public traffic and synchronous upstream scraping. This project solves that by combining:

1. **Stale-While-Revalidate (SWR) SQLite Cache**: Cached responses are served in `<20ms`. When an entry becomes stale, the stale data is returned immediately while a background job refreshes it—user requests never block on upstream scraping.
2. **Request Coalescing (Singleflight)**: Concurrent requests for the same resource share a single upstream call, preventing thundering-herd bursts.
3. **Rate-Limited Upstream Queue**: Enforces concurrency limits, minimum intervals, timeouts, and exponential backoff retries.
4. **Hybrid Upstream Strategy**:
   - **Hybrid Mode** (recommended): Uses MyAnimeList's Official API v2 (`MAL_CLIENT_ID`) for core anime, search, top, and seasonal endpoints, and Cheerio HTML scraping for characters/voice actors.
   - **Scraper Fallback Mode**: Automatically falls back to HTML scraping if `MAL_CLIENT_ID` is not set.

---

## Architecture

```
Client / Browser
   │
   ▼
Hono API Server (TypeScript + Zod OpenAPI)
   ├── Web Dashboard UI (/)
   ├── Interactive OpenAPI Docs (/docs)
   └── /v4/* Jikan-compatible Routes
          │
          ▼
   SQLite SWR Cache (node:sqlite)
     ├── HIT / STALE ──► Instant JSON Response (<20ms)
     └── MISS / Background Refresh
            │
            ▼
       Singleflight (Deduplication)
            │
            ▼
       Rate-Limited Queue
            │
            ├──► MAL Official API v2 (when MAL_CLIENT_ID is set)
            └──► Cheerio HTML Scraper (characters + automatic fallback)
```

---

## Quick Start

### Prerequisites
- **Node.js >= 22.5** (tested on Node.js 26; uses built-in `node:sqlite`)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional)
```bash
cp .env.example .env
```
Add your free `MAL_CLIENT_ID` from [MyAnimeList API Config](https://myanimelist.net/apiconfig) to enable **Hybrid Mode**. If left empty, the server runs in **Scraper Mode** automatically.

### 3. Run Development Server
```bash
npm run dev
```

Open:
- **Web Dashboard UI**: `http://localhost:3000/`
- **Interactive OpenAPI Docs**: `http://localhost:3000/docs`
- **OpenAPI JSON Spec**: `http://localhost:3000/openapi.json`

### 4. Production Build
```bash
npm run build
npm start
```

### 5. Deploy (EasyPanel, VPS, Docker, Coolify, PaaS)
Lihat panduan lengkap di **[DEPLOYMENT.md](DEPLOYMENT.md)** (tersedia juga [Dockerfile](Dockerfile) dan [docker-compose.yml](docker-compose.yml)).

---

## API Endpoints (Jikan v4 Compatible)

### Core & Sub-Resources
| Category | Endpoints |
| :--- | :--- |
| **Anime** | `/v4/anime`, `/v4/anime/:id`, `/full`, `/characters`, `/staff`, `/episodes`, `/episodes/:episode`, `/news`, `/relations`, `/themes`, `/videos`, `/pictures`, `/statistics`, `/recommendations`, `/forum`, `/moreinfo`, `/external`, `/streaming` |
| **Manga** | `/v4/manga`, `/v4/manga/:id`, `/full`, `/characters`, `/news`, `/relations`, `/pictures`, `/statistics`, `/recommendations`, `/forum`, `/moreinfo`, `/external` |
| **Top** | `/v4/top/anime` (`all`, `airing`, `upcoming`, `tv`, `movie`, `ova`, `ona`, `special`, `bypopularity`, `favorite`), `/v4/top/manga`, `/v4/top/characters`, `/v4/top/people`, `/v4/top/reviews` |
| **Seasons** | `/v4/seasons`, `/v4/seasons/now`, `/v4/seasons/upcoming`, `/v4/seasons/:year/:season` |
| **Discovery** | `/v4/schedules`, `/v4/genres/anime`, `/v4/genres/manga`, `/v4/news` (global), `/v4/reviews/anime`, `/v4/reviews/manga`, `/v4/recommendations/anime`, `/v4/recommendations/manga` |
| **Watch & Random** | `/v4/watch/episodes`, `/v4/watch/episodes/popular`, `/v4/watch/promos`, `/v4/random/:type` (`anime`, `manga`, `characters`, `people`, `users`) |
| **Entities** | `/v4/characters/:id` (`+ /full, /anime, /manga, /voices, /pictures`), `/v4/people/:id` (`+ /full, /anime, /voices, /manga, /pictures`), `/v4/producers`, `/v4/producers/:id`, `/v4/magazines` |
| **Community** | `/v4/clubs`, `/v4/clubs/:id` (`+ /members, /staff, /relations`), `/v4/users`, `/v4/users/userbyid/:id`, `/v4/users/:username` (`+ /full, /about, /statistics, /favorites, /userupdates, /history, /friends, /reviews, /recommendations, /clubs, /animelist, /mangalist`) |
| **System** | `/health`, `/api/stats`, `/docs`, `/openapi.json` |

Every `/v4/*` response includes observability headers:
- `X-Cache`: `HIT` | `STALE` | `MISS`
- `X-Cache-Age`: Age of cached entry in seconds
- `X-Upstream-Mode`: `hybrid` | `scraper`
- `X-Response-Time`: Server processing time in `ms`

---

## Project Structure

```text
src/
├── config/          # Environment configuration loader
├── cache/           # SQLite Stale-While-Revalidate cache
├── utils/           # Singleflight request deduplication
├── upstream/        # Rate-limited queue, MAL API v2 client, Cheerio scraper
├── mappers/         # MAL API v2 -> Jikan v4 normalizers
├── services/        # Hybrid orchestration service
├── routes/          # Modular Hono OpenAPI route handlers
├── types/           # Jikan v4 TypeScript interfaces
├── app.ts           # Hono app factory & middleware
└── index.ts         # Server entrypoint & graceful shutdown
public/              # Web Dashboard UI (HTML/CSS/JS)
tests/               # Vitest unit tests
```

---

## Testing & Typechecking

```bash
npm run typecheck
npm test
```

## License

MIT
