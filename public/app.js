const statsEntries = document.getElementById('stat-entries');
const statsHitRate = document.getElementById('stat-hitrate');
const statsHits = document.getElementById('stat-hits');
const statsUptime = document.getElementById('stat-uptime');
const modeBadge = document.getElementById('mode-badge');
const browseMeta = document.getElementById('browse-meta');
const animeGrid = document.getElementById('anime-grid');

const playgroundUrl = document.getElementById('playground-url');
const playgroundSend = document.getElementById('playground-send');
const playgroundHeaders = document.getElementById('playground-headers');
const playgroundOutput = document.getElementById('playground-output');

const modal = document.getElementById('detail-modal');
const modalBody = document.getElementById('modal-body');

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    modeBadge.textContent = `Mode: ${data.mode.toUpperCase()}`;
    statsEntries.textContent = String(data.cache.totalEntries);
    statsHitRate.textContent = `${data.cache.hitRate}%`;
    statsHits.textContent = `${data.cache.hits} / ${data.cache.staleHits}`;
    statsUptime.textContent = `${data.uptimeSeconds}s`;
  } catch {
    modeBadge.textContent = 'Mode: Offline';
  }
}

function renderCacheMeta(targetEl, res, elapsedMs, extraText = '') {
  const cache = res.headers.get('X-Cache') || 'NONE';
  const time = res.headers.get('X-Response-Time') || `${elapsedMs}ms`;
  const mode = res.headers.get('X-Upstream-Mode') || '-';
  targetEl.innerHTML = `
    <span class="cache-pill cache-${cache}">X-Cache: ${cache}</span>
    <span>Server Time: <strong>${time}</strong></span>
    <span>Upstream: <strong>${mode}</strong></span>
    ${extraText ? `<span>${extraText}</span>` : ''}
  `;
}

async function fetchAndRenderGrid(endpoint, kind = 'anime') {
  animeGrid.innerHTML = '<p style="color: var(--muted)">Loading...</p>';
  const start = performance.now();
  try {
    const res = await fetch(endpoint);
    const json = await res.json();
    const elapsed = Math.round(performance.now() - start);
    renderCacheMeta(browseMeta, res, elapsed, `Endpoint: <code>${endpoint}</code>`);

    if (!res.ok || !Array.isArray(json.data)) {
      animeGrid.innerHTML = `<p style="color: #f87171">${json.message || 'Failed to load data'}</p>`;
      return;
    }

    animeGrid.innerHTML = '';
    for (const item of json.data) {
      const card = document.createElement('div');
      card.className = 'anime-card';
      const img = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '';
      card.innerHTML = `
        <img src="${img}" alt="${item.title}" loading="lazy" />
        <div class="anime-card-body">
          <div class="anime-card-title">${item.title}</div>
          <div class="anime-card-meta">
            <span>★ ${item.score ?? 'N/A'}</span>
            <span>${item.type ?? (kind === 'manga' ? 'Manga' : 'Anime')}</span>
          </div>
        </div>
      `;
      card.addEventListener('click', () => openMediaDetail(item.mal_id, kind));
      animeGrid.appendChild(card);
    }
    loadStats();
  } catch (err) {
    animeGrid.innerHTML = `<p style="color: #f87171">Error: ${err.message}</p>`;
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNumber(num) {
  return typeof num === 'number' ? num.toLocaleString() : '-';
}

async function openMediaDetail(id, kind = 'anime') {
  modal.classList.remove('hidden');
  modalBody.innerHTML = `<p style="color: var(--muted)">Loading full ${kind} details...</p>`;
  try {
    const [fullRes, charsRes] = await Promise.all([
      fetch(`/v4/${kind}/${id}/full`),
      fetch(`/v4/${kind}/${id}/characters`).catch(() => null),
    ]);

    const { data } = await fullRes.json();
    const charsJson = charsRes && charsRes.ok ? await charsRes.json() : { data: [] };
    const allCharacters = Array.isArray(charsJson.data) ? charsJson.data : [];
    const initialCharLimit = 12;
    const renderCharCards = (list) =>
      list
        .map((c) => {
          const va = (c.voice_actors || []).find((v) => v.language === 'Japanese') || c.voice_actors?.[0];
          return `
            <div class="char-card">
              <img src="${c.character?.images?.jpg?.image_url || ''}" alt="${escapeHtml(c.character?.name)}" />
              <div>
                <strong>${escapeHtml(c.character?.name)}</strong>
                <small>${escapeHtml(c.role)}${va ? ` • ${escapeHtml(va.person?.name)}` : ''}</small>
              </div>
            </div>
          `;
        })
        .join('');

    const img = data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || '';
    const cacheStatus = fullRes.headers.get('X-Cache') || '-';
    const respTime = fullRes.headers.get('X-Response-Time') || '-';

    const altTitles = [data.title_english, data.title_japanese]
      .filter((t) => t && t !== data.title)
      .map(escapeHtml)
      .join(' • ');

    const genresHtml = [
      ...(data.genres || []),
      ...(data.themes || []),
      ...(data.demographics || []),
    ]
      .map((g) => `<span class="chip">${escapeHtml(g.name)}</span>`)
      .join('') || '<span class="chip">No genres</span>';

    const producersList = (data.producers || []).map((p) => escapeHtml(p.name)).join(', ') || '-';
    const licensorsList = (data.licensors || []).map((l) => escapeHtml(l.name)).join(', ') || '-';
    const synonymsText = (data.title_synonyms || []).map(escapeHtml).join(', ');
    const trailerBtn = data.trailer?.url
      ? `<a class="btn btn-ghost" href="${escapeHtml(data.trailer.url)}" target="_blank" rel="noreferrer">Watch Trailer ↗</a>`
      : '';

    const extraLabel = kind === 'manga' ? 'Authors' : 'Studios';
    const extraList =
      kind === 'manga'
        ? (data.authors || []).map((a) => escapeHtml(a.name)).join(', ') || '-'
        : (data.studios || []).map((s) => escapeHtml(s.name)).join(', ') || '-';

    const countRow =
      kind === 'manga'
        ? `<div><span>Chapters / Vols</span><strong>${data.chapters ?? '?'} / ${data.volumes ?? '?'}</strong></div>`
        : `<div><span>Episodes</span><strong>${data.episodes ?? '?'}</strong></div>`;

    const dateLabel = kind === 'manga' ? 'Published' : 'Aired';
    const dateValue = kind === 'manga' ? data.published?.string : data.aired?.string;

    const relationsHtml = (data.relations || []).length
      ? `<div class="detail-section">
          <h3>Relations</h3>
          <div class="chip-list">
            ${data.relations
              .map((rel) =>
                (rel.entry || [])
                  .map(
                    (e) =>
                      `<button type="button" class="chip chip-link" data-rel-id="${e.mal_id}" data-rel-type="${e.type}">
                        <strong>${escapeHtml(rel.relation)}:</strong> ${escapeHtml(e.name)}
                      </button>`,
                  )
                  .join(''),
              )
              .join('')}
          </div>
        </div>`
      : '';

    const charsHtml = allCharacters.length
      ? `<div class="detail-section">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <h3 style="margin-bottom:0">Characters (${allCharacters.length})</h3>
            ${
              allCharacters.length > initialCharLimit
                ? `<button type="button" id="show-all-chars" class="preset-btn">Show all (${allCharacters.length})</button>`
                : ''
            }
          </div>
          <div id="chars-grid" class="chars-grid">
            ${renderCharCards(allCharacters.slice(0, initialCharLimit))}
          </div>
        </div>`
      : '';

    const themes = data.theme;
    const themesHtml =
      themes && (themes.openings?.length || themes.endings?.length)
        ? `<div class="detail-section">
            <h3>Themes</h3>
            ${
              themes.openings?.length
                ? `<p style="font-size:12px;color:var(--muted);margin-bottom:4px"><strong>Opening</strong></p>
                   <ul class="theme-list">${themes.openings.slice(0, 5).map((t) => `<li>• ${escapeHtml(t)}</li>`).join('')}</ul>`
                : ''
            }
            ${
              themes.endings?.length
                ? `<p style="font-size:12px;color:var(--muted);margin:8px 0 4px"><strong>Ending</strong></p>
                   <ul class="theme-list">${themes.endings.slice(0, 5).map((t) => `<li>• ${escapeHtml(t)}</li>`).join('')}</ul>`
                : ''
            }
          </div>`
        : '';

    const links = [...(data.streaming || []), ...(data.external || [])];
    const linksHtml = links.length
      ? `<div class="detail-section">
          <h3>Streaming & External Links</h3>
          <div class="chip-list">
            ${links
              .map((l) => `<a class="chip chip-link" href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">${escapeHtml(l.name)} ↗</a>`)
              .join('')}
          </div>
        </div>`
      : '';

    modalBody.innerHTML = `
      <div class="modal-detail">
        <div class="modal-poster">
          <img src="${img}" alt="${escapeHtml(data.title)}" />
          <div class="modal-quick-stats">
            <div><span>Score</span><strong>★ ${data.score ?? 'N/A'}</strong></div>
            <div><span>Rank</span><strong>#${data.rank ?? '-'}</strong></div>
            <div><span>Popularity</span><strong>#${data.popularity ?? '-'}</strong></div>
            <div><span>Members</span><strong>${formatNumber(data.members)}</strong></div>
            <div><span>Scored By</span><strong>${formatNumber(data.scored_by)}</strong></div>
            ${countRow}
            <div><span>Cache</span><strong>${cacheStatus} (${respTime})</strong></div>
          </div>
          <div class="modal-actions">
            <a class="btn btn-secondary" href="${escapeHtml(data.url)}" target="_blank" rel="noreferrer">Open on MAL ↗</a>
            ${trailerBtn}
            <a class="btn btn-ghost" href="/v4/${kind}/${id}/full" target="_blank" rel="noreferrer">View JSON ↗</a>
          </div>
        </div>
        <div>
          <h2 style="margin-bottom: 4px">${escapeHtml(data.title)}</h2>
          ${altTitles ? `<p class="detail-subtitle">${altTitles}</p>` : '<div style="margin-bottom: 6px"></div>'}
          ${synonymsText ? `<p class="detail-subtitle" style="font-size:12px">Synonyms: ${synonymsText}</p>` : ''}
          <div class="chip-list">${genresHtml}</div>
          <div class="info-grid">
            <div><span>Type</span><strong>${escapeHtml(data.type || '-')}</strong></div>
            <div><span>Status</span><strong>${escapeHtml(data.status || '-')}</strong></div>
            <div><span>${dateLabel}</span><strong>${escapeHtml(dateValue || '-')}</strong></div>
            ${
              kind === 'anime'
                ? `<div><span>Season</span><strong>${escapeHtml(data.season ? `${data.season} ${data.year ?? ''}` : '-')}</strong></div>
                   <div><span>Broadcast</span><strong>${escapeHtml(data.broadcast?.string || '-')}</strong></div>
                   <div><span>Duration</span><strong>${escapeHtml(data.duration || '-')}</strong></div>
                   <div><span>Rating</span><strong>${escapeHtml(data.rating || '-')}</strong></div>
                   <div><span>Source</span><strong>${escapeHtml(data.source || '-')}</strong></div>
                   <div><span>Producers</span><strong>${producersList}</strong></div>
                   <div><span>Licensors</span><strong>${licensorsList}</strong></div>`
                : `<div><span>Serializations</span><strong>${(data.serializations || []).map((s) => escapeHtml(s.name)).join(', ') || '-'}</strong></div>`
            }
            <div><span>${extraLabel}</span><strong>${extraList}</strong></div>
          </div>
          <p style="font-size: 13px; color: #cbd5e1; line-height: 1.6">${escapeHtml(data.synopsis || 'No synopsis available.')}</p>
          ${data.background ? `<p style="font-size: 12px; color: var(--muted); margin-top: 10px"><strong>Background:</strong> ${escapeHtml(data.background)}</p>` : ''}
          ${relationsHtml}
          ${charsHtml}
          ${themesHtml}
          ${linksHtml}
        </div>
      </div>
    `;

    modalBody.querySelectorAll('[data-rel-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const relId = btn.getAttribute('data-rel-id');
        const relType = btn.getAttribute('data-rel-type');
        if (relId && (relType === 'anime' || relType === 'manga')) {
          openMediaDetail(relId, relType);
        }
      });
    });

    const showAllCharsBtn = document.getElementById('show-all-chars');
    if (showAllCharsBtn) {
      showAllCharsBtn.addEventListener('click', () => {
        document.getElementById('chars-grid').innerHTML = renderCharCards(allCharacters);
        showAllCharsBtn.remove();
      });
    }

    loadStats();
  } catch (err) {
    modalBody.innerHTML = `<p style="color: #f87171">Failed to load details: ${escapeHtml(err.message)}</p>`;
  }
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('search-input').value.trim();
  const kind = document.getElementById('media-type').value;
  const rating = document.getElementById('rating-filter').value;
  const sfw = document.getElementById('sfw-filter').checked;

  const params = new URLSearchParams({ limit: '12', sfw: String(sfw) });
  if (q) params.set('q', q);
  if (kind === 'anime' && rating) params.set('rating', rating);

  if (!q && !rating) return;
  fetchAndRenderGrid(`/v4/${kind}?${params.toString()}`, kind);
});

document.querySelectorAll('.quick-filters button').forEach((btn) => {
  btn.addEventListener('click', () => fetchAndRenderGrid(btn.dataset.endpoint, btn.dataset.kind || 'anime'));
});

async function runPlayground() {
  const url = playgroundUrl.value.trim();
  if (!url) return;
  playgroundOutput.textContent = 'Fetching...';
  const start = performance.now();
  try {
    const res = await fetch(url);
    const json = await res.json();
    const elapsed = Math.round(performance.now() - start);
    renderCacheMeta(playgroundHeaders, res, elapsed, `HTTP ${res.status}`);
    playgroundOutput.textContent = JSON.stringify(json, null, 2);
    loadStats();
  } catch (err) {
    playgroundOutput.textContent = `Error: ${err.message}`;
  }
}

playgroundSend.addEventListener('click', runPlayground);
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    playgroundUrl.value = btn.dataset.url;
    runPlayground();
  });
});

document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));
document.querySelector('.modal-backdrop').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('clear-cache-btn').addEventListener('click', async () => {
  await fetch('/api/cache/clear', { method: 'POST' });
  loadStats();
});

loadStats();
fetchAndRenderGrid('/v4/top/anime?filter=airing&limit=12');
