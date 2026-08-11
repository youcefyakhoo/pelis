// PelisLatinoHD clone - static SPA (hash router)
// Replicates the real site: home slider + modules, paginated listings,
// genre/country/tag pages, series episodes, inline players, responsive menus.

const PER_PAGE = 28;              // items per listing page (grid)
const HOME_ITEMS = 14;            // per home module
const SLIDER_ITEMS = 10;          // recommendation slides

const el = (html) => {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let CATALOG = { movies: [], series: [], genres: {}, countries: {}, genresList: [], countriesList: [], tags: {}, recentEpisodes: [], meta: {} };
let loaded = false;

const root = document.getElementById("main-content");
const header = document.querySelector("header.main");

async function loadData() {
  if (loaded) return;
  try {
    const res = await fetch("data/catalog.json");
    CATALOG = await res.json();
    loaded = true;
  } catch (e) {
    root.innerHTML = `<div class="empty">No se pudo cargar el catálogo (data/catalog.json).<br>Ejecuta primero: <code>node scraper/scrape.mjs</code></div>`;
  }
}

// ------------- helpers -------------
const allItems = () => [...CATALOG.movies, ...CATALOG.series];
const genreName = (id) => CATALOG.genres[id] || "";
const countryName = (id) => CATALOG.countries[id] || "";

function findBySlug(type, slug) {
  const list = type === "movie" ? CATALOG.movies : CATALOG.series;
  return list.find((x) => x.slug === slug) || null;
}

function resolveSlugs(slugs, type) {
  // slugs may include japanese-encoded or unmatched ones; match by exact slug
  const found = [];
  const seen = new Set();
  const list = type ? (type === "movie" ? CATALOG.movies : CATALOG.series) : allItems();
  const map = new Map(list.map((x) => [x.slug, x]));
  for (const s of slugs) {
    const item = map.get(s);
    if (item && !seen.has(item.slug)) { seen.add(item.slug); found.push(item); }
  }
  return found;
}

// ------------- UI renderers -------------
function card(item) {
  const typeLabel = item.type === "movie" ? "Película" : "Serie";
  const href = `#/detalle/${item.type}/${item.slug}`;
  const rating = item.rating > 0 ? `<span class="rating-c">★ ${item.rating.toFixed(1)}</span>` : "";
  const year = item.year ? `<span class="year">${esc(item.year)}</span>` : "";
  const genres = (item.genres || []).map(genreName).filter(Boolean).slice(0, 3).join(", ");
  return `
  <article class="item ${item.type === "movie" ? "movies" : "tvshows"}">
    <div class="poster">
      <div class="rating">${rating}</div>
      <img loading="lazy" src="${esc(item.poster)}" alt="${esc(item.title)}" onerror="this.style.display='none'"/>
      <span class="item_quality">${typeLabel === "Película" ? "HD" : "SERIE"}</span>
      ${year}
      <a class="see" href="${href}" aria-label="${esc(item.title)}">
        <svg class="play" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#005199"/><path d="M10 8l6 4-6 4z" fill="#fff"/></svg>
      </a>
    </div>
    <div class="data">
      <h3><a href="${href}">${esc(item.title)}</a></h3>
      ${genres ? `<span class="genres">${esc(genres)}</span>` : ""}
    </div>
  </article>`;
}

function episodeHomeCard(ep) {
  // find the serie to link detail
  const serie = CATALOG.series.find((s) => s.title.toLowerCase() === String(ep.serie || "").toLowerCase());
  const href = serie ? `#/detalle/series/${serie.slug}` : "#/episodios";
  const label = `T${ep.season} E${ep.episode}`;
  const poster = serie ? serie.poster : null;
  return `
  <div class="episode-card" data-src="${esc(ep.embedded)}" data-name="${esc(ep.serie)} - ${label}">
    ${poster ? `<img src="${esc(poster)}" alt="" style="width:100%;aspect-ratio:2/1;object-fit:cover;border-radius:6px;margin-bottom:8px;"/>` : ""}
    <div class="ep-title">${esc(ep.serie)}</div>
    <div class="ep-meta">${esc(ep.title)} &middot; <b>${label}</b></div>
  </div>`;
}

function renderModule(title, items, link, icon) {
  return `
  <section class="module">
    <div class="content">
      <header>
        <h2>${icon || ""} ${esc(title)}</h2>
        ${link ? `<a class="see-all" href="${link}">Ver todo <span class="fas fa-angle-right"></span></a>` : ""}
      </header>
      <div class="items">${items.map(card).join("")}</div>
    </div>
  </section>`;
}

// ------------- Slider -------------
function renderSlider(title, items) {
  const valid = items.filter((x) => x.backdrop || x.poster).slice(0, SLIDER_ITEMS);
  if (!valid.length) return "";
  const slides = valid
    .map((it, i) => {
      const bg = it.backdrop || it.poster;
      const bgStyle = `background-image:url('${esc(bg)}')`;
      return `
      <div class="slide" style="${bgStyle}" onclick="location.hash='#/detalle/${it.type}/${it.slug}'">
        <div class="bg"></div>
        <div class="content">
          <h2>${esc(it.title)}</h2>
          <p class="sinopsis">${esc(it.synopsis || "")}</p>
          <div class="chips">
            ${it.rating ? `<span class="chip rate">★ ${it.rating.toFixed(1)}</span>` : ""}
            ${it.year ? `<span class="chip">${esc(it.year)}</span>` : ""}
            ${(it.genres || []).map(genreName).filter(Boolean).slice(0, 2).map((g) => `<span class="chip">${esc(g)}</span>`).join("")}
            <span class="chip play-chip">▶ Ver ahora</span>
          </div>
        </div>
      </div>`;
    })
    .join("");
  const dots = valid.map((_, i) => `<button data-i="${i}" ${i === 0 ? 'class="active"' : ""}></button>`).join("");
  return `
  <section class="slider-wrap">
    <div class="slider" id="home-slider">${slides}</div>
    <div class="slider-arrows">
      <button class="arrow prev" id="slider-prev">&#10094;</button>
      <button class="arrow next" id="slider-next">&#10095;</button>
    </div>
    <div class="slider-dots" id="slider-dots">${dots}</div>
  </section>`;
}

function initSlider() {
  const track = document.getElementById("home-slider");
  const prev = document.getElementById("slider-prev");
  const next = document.getElementById("slider-next");
  const dotsBox = document.getElementById("slider-dots");
  if (!track) return;
  const n = track.children.length;
  let i = 0;
  const go = (to) => {
    i = (to + n) % n;
    track.style.transform = `translateX(-${i * 100}%)`;
    [...dotsBox.children].forEach((d, k) => d.classList.toggle("active", k === i));
  };
  next.onclick = () => go(i + 1);
  prev.onclick = () => go(i - 1);
  if (dotsBox) dotsBox.onclick = (e) => {
    const b = e.target.closest("button");
    if (b) go(Number(b.dataset.i));
  };
  setInterval(() => go(i + 1), 6000);
}

// ------------- Pagination -------------
function pagination(total, page, base) {
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (pages <= 1) return "";
  const p = Math.min(Math.max(1, page), pages);
  const btn = (label, href, cls, disabled) => {
    const h = href ? `href="${href}"` : "";
    return `<a class="arrow_pag ${cls || ""} ${disabled ? "disabled" : ""}" ${h}>${label}</a>`;
  };
  let nums = "";
  const start = Math.max(1, p - 2);
  const end = Math.min(pages, p + 2);
  if (start > 1) { nums += `<a class="inactive" href="${base}/1">1</a>`; if (start > 2) nums += `<span class="dots">...</span>`; }
  for (let k = start; k <= end; k++) {
    nums += k === p ? `<span class="current">${k}</span>` : `<a class="inactive" href="${base}/${k}">${k}</a>`;
  }
  if (end < pages) { if (end < pages - 1) nums += `<span class="dots">...</span>`; nums += `<a class="inactive" href="${base}/${pages}">${pages}</a>`; }
  return `
  <div class="pagination">
    <span class="total">Página ${p} de ${pages}</span>
    ${btn("&#10094;", p > 1 ? `${base}/${p - 1}` : "", "prev", p <= 1)}
    ${nums}
    ${btn("&#10095;", p < pages ? `${base}/${p + 1}` : "", "next", p >= pages)}
  </div>`;
}

function paginatedList(items, page, base) {
  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = items.slice((p - 1) * PER_PAGE, p * PER_PAGE);
  return `
    <div class="items">${slice.map(card).join("")}</div>
    ${pagination(items.length, p, base)}`;
}

// ------------- Router -------------
async function route() {
  await loadData();
  const hash = location.hash.replace(/^#\//, "");
  const parts = hash.split("/").filter(Boolean);

  if (!parts.length) return renderHome();

  switch (parts[0]) {
    case "home": return renderHome();
    case "peliculas": return renderListing("Películas", CATALOG.movies, parts[1], "#/peliculas");
    case "series": return renderListing("Series", CATALOG.series, parts[1], "#/series");
    case "episodios": return renderEpisodesPage(parts[1]);
    case "tendencias": return renderTendencias(parts[1]);
    case "imdb": return renderIMDb(parts[1]);
    case "animes": return renderTag("anime", parts[1]);
    case "tag": return parts[1] ? renderTagByName(parts[1], parts[2]) : renderHome();
    case "genero": return parts[1] ? renderGenre(parts[1], parts[2]) : renderHome();
    case "pais": return parts[1] ? renderCountry(parts[1], parts[2]) : renderHome();
    case "detalle": return parts[1] && parts[2] ? renderDetail(parts[1], parts[2]) : renderHome();
    default: return renderHome();
  }
}

// ------------- Home -------------
function renderHome() {
  const movies = CATALOG.movies;
  const series = CATALOG.series;

  // slider: top rated movies/series as "Recomendaciones"
  const recommended = allItems().filter((x) => x.rating > 0).sort((a, b) => b.rating - a.rating);

  const animeItems = resolveSlugs(CATALOG.tags.anime || [], null);
  const superheroItems = resolveSlugs(CATALOG.tags.superhero || [], null);
  const cartoonItems = resolveSlugs(CATALOG.tags.cartoon || [], null);

  const recentEpisodes = CATALOG.recentEpisodes || [];

  let html = "";
  html += renderSlider("", recommended);
  html += renderModule("Películas Latino HD", movies.slice(0, HOME_ITEMS), "#/peliculas", `<span class="fas fa-film"></span>`);
  html += `
    <section class="module">
      <div class="content">
        <header><h2><span class="fas fa-tv"></span> Nuevos Episodios</h2><a class="see-all" href="#/episodios">Ver todo <span class="fas fa-angle-right"></span></a></header>
        <div class="episodes-row" id="recent-episodes">${recentEpisodes.slice(0, 12).map(episodeHomeCard).join("")}</div>
      </div>
    </section>`;
  html += renderModule("Series destacadas", series.slice(0, HOME_ITEMS), "#/series", `<span class="fas fa-th-list"></span>`);
  html += renderModule("Animes", animeItems.slice(0, HOME_ITEMS), "#/animes", `<span class="fas fa-fire"></span>`);
  html += renderModule("Superhéroes", superheroItems.slice(0, HOME_ITEMS), "#/tag/superhero", `<span class="fas fa-bolt"></span>`);
  html += renderModule("Animados", cartoonItems.slice(0, HOME_ITEMS), "#/tag/cartoon", `<span class="fas fa-paint-brush"></span>`);

  root.innerHTML = html;
  initSlider();
  bindRecentEpisodes();
}

function bindRecentEpisodes() {
  root.querySelectorAll(".episode-card[data-src]").forEach((card) => {
    card.addEventListener("click", () => {
      openPlayer(card.dataset.src, card.dataset.name);
    });
  });
}

// ------------- Listing (paged grid) -------------
function renderListing(title, items, pageStr, base) {
  const page = parseInt(pageStr, 10) || 1;
  const sorted = [...items].sort((a, b) => (b.year || 0) - (a.year || 0));
  root.innerHTML = `
    <h1 class="page-title">${esc(title)}</h1>
    <p class="count-results">${items.length} títulos</p>
    ${paginatedList(sorted, page, base)}`;
}

function renderTendencias(pageStr) {
  const page = parseInt(pageStr, 10) || 1;
  const items = allItems().filter((x) => x.rating > 0).sort((a, b) => b.rating - a.rating);
  root.innerHTML = `
    <h1 class="page-title">Tendencias</h1>
    <p class="count-results">${items.length} títulos</p>
    ${paginatedList(items, page, "#/tendencias")}`;
}

function renderIMDb(pageStr) {
  const page = parseInt(pageStr, 10) || 1;
  const items = allItems().filter((x) => x.rating > 0).sort((a, b) => b.rating - a.rating);
  root.innerHTML = `
    <h1 class="page-title"><span class="fas fa-star"></span> Ranking IMDb</h1>
    <p class="count-results">${items.length} títulos</p>
    ${paginatedList(items, page, "#/imdb")}`;
}

function renderEpisodesPage(pageStr) {
  const page = parseInt(pageStr, 10) || 1;
  const eps = CATALOG.recentEpisodes || [];
  const pages = Math.max(1, Math.ceil(eps.length / PER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const slice = eps.slice((p - 1) * PER_PAGE, p * PER_PAGE);
  const grid = `
    <div class="episodes-row" id="recent-episodes">
      ${slice.map(episodeHomeCard).join("")}
    </div>`;
  root.innerHTML = `
    <h1 class="page-title"><span class="fas fa-tv"></span> Nuevos Episodios</h1>
    <p class="count-results">${eps.length} episodios</p>
    ${grid}
    ${pagination(eps.length, p, "#/episodios")}`;
  bindRecentEpisodes();
}

// ------------- Tag pages -------------
function renderTag(slug, pageStr) {
  return renderTagByName(slug, pageStr);
}
function renderTagByName(slug, pageStr) {
  const page = parseInt(pageStr, 10) || 1;
  const names = { anime: "Animes", superhero: "Superhéroes", cartoon: "Animados" };
  const items = resolveSlugs(CATALOG.tags[slug] || [], null);
  root.innerHTML = `
    <h1 class="page-title">${esc(names[slug] || slug)}</h1>
    <p class="count-results">${items.length} títulos</p>
    ${paginatedList(items, page, `#/tag/${slug}`)}`;
}

function renderGenre(slug, pageStr) {
  const page = parseInt(pageStr, 10) || 1;
  const target = (CATALOG.genresList || []).find((g) => g.slug === slug || String(g.id) === slug || genreName(g.id).toLowerCase() === slug);
  const gid = target ? target.id : Object.keys(CATALOG.genres).find((id) => genreName(id).toLowerCase() === slug);
  const name = target ? target.name : (gid ? genreName(gid) : slug);
  const items = allItems().filter((x) => (x.genres || []).includes(gid ? Number(gid) : -1));
  root.innerHTML = `
    <h1 class="page-title">Género: ${esc(name)}</h1>
    <p class="count-results">${items.length} títulos</p>
    ${paginatedList(items, page, `#/genero/${slug}`)}`;
}

function renderCountry(slug, pageStr) {
  const page = parseInt(pageStr, 10) || 1;
  const target = (CATALOG.countriesList || []).find((c) => c.slug === slug || String(c.id) === slug || countryName(c.id).toLowerCase() === slug);
  const cid = target ? target.id : Object.keys(CATALOG.countries).find((id) => countryName(id).toLowerCase() === slug);
  const name = target ? target.name : (cid ? countryName(cid) : slug);
  const items = allItems().filter((x) => (x.countries || []).includes(cid ? Number(cid) : -1));
  root.innerHTML = `
    <h1 class="page-title">País: ${esc(name)}</h1>
    <p class="count-results">${items.length} títulos</p>
    ${paginatedList(items, page, `#/pais/${slug}`)}`;
}

// ------------- Detail -------------
function renderDetail(type, slug) {
  const item = findBySlug(type, slug);
  if (!item) { root.innerHTML = `<div class="empty">No se encontró el título.</div>`; return; }

  const genres = (item.genres || [])
    .map((g) => genreName(g))
    .filter(Boolean)
    .map((g) => `<a href="#/genero/${encodeURIComponent(g.toLowerCase())}">${esc(g)}</a>`)
    .join("");

  const metaSpans = `
    ${item.year ? `<span>${esc(item.year)}</span>` : ""}
    ${item.runtime ? `<span>${esc(item.runtime)} min</span>` : ""}
    ${item.country ? `<span>${esc(item.country)}</span>` : ""}
    ${item.rating ? `<span class="rate">★ ${item.rating.toFixed(1)}</span>` : ""}
    ${item.seasons ? `<span>${esc(item.seasons)} temporada${item.seasons > 1 ? "s" : ""}</span>` : ""}
    ${item.episodesCount ? `<span>${esc(item.episodesCount)} episodios</span>` : ""}
  `;

  const embedUrl = item.type === "movie"
    ? `https://playpaste.link/player/embed.php?id=${encodeURIComponent(item.embeddedId)}`
    : null;

  const playBtn = item.type === "movie"
    ? `<button class="play-btn" data-player="player-${item.slug}" data-src="${esc(embedUrl)}"><span class="fas fa-play"></span> Reproducir</button>`
    : "";

  const episodeSection = item.type === "series" && item.episodes && item.episodes.length
    ? renderEpisodes(item)
    : "";

  root.innerHTML = `
    <a class="back" href="javascript:history.back()">&larr; Volver</a>
    <section class="module">
      <div class="detail-head">
        <div class="poster-big">
          <img src="${esc(item.poster)}" alt="${esc(item.title)}" onerror="this.style.display='none'"/>
        </div>
        <div class="detail-info">
          <h1>${esc(item.title)}</h1>
          ${item.originalTitle && item.originalTitle !== item.title ? `<p class="original">${esc(item.originalTitle)}</p>` : ""}
          <div class="meta">${metaSpans}</div>
          <p class="synopsis">${esc(item.synopsis || "Sin sinopsis disponible.")}</p>
          ${genres ? `<div class="genres">${genres}</div>` : ""}
          ${playBtn}
        </div>
      </div>
      <div class="player-wrap" id="player-${item.slug}"></div>
      ${episodeSection}
    </section>`;

  const btn = root.querySelector(".play-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      const wrap = document.getElementById(btn.dataset.player);
      if (!wrap) return;
      wrap.classList.add("active");
      wrap.innerHTML = `<iframe src="${btn.dataset.src}" allowfullscreen scrolling="no" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture"></iframe>`;
    });
  }
}

function renderEpisodes(show) {
  // group by season, keep original order
  const bySeason = {};
  for (const ep of show.episodes || []) {
    const s = ep.season || "1";
    (bySeason[s] = bySeason[s] || []).push(ep);
  }
  const seasons = Object.keys(bySeason).map(Number).sort((a, b) => a - b);
  return seasons.map((s) => {
    const eps = bySeason[s].map((ep) => `
      <li>
        <a href="javascript:void(0)" data-src="${esc(ep.embedded)}" data-name="${esc(show.title)} - T${ep.season} E${ep.episode}">
          <span>${esc(ep.title || `Episodio ${ep.episode}`)}</span>
          <span class="num">T${ep.season} E${ep.episode}</span>
        </a>
      </li>`).join("");
    return `
    <div class="seasons">
      <h3 class="se-title">Temporada ${s}</h3>
      <ul class="episodes-list">${eps}</ul>
    </div>`;
  }).join("");
}

function openPlayer(src, name) {
  // ensure a live #show-player inside the current #main-content
  let wrap = document.getElementById("show-player");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "player-wrap active";
    wrap.id = "show-player";
    root.prepend(wrap);
  }
  wrap.innerHTML = `<iframe src="${src}" allowfullscreen scrolling="no" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture"></iframe>`;
  if (name) wrap.setAttribute("data-name", name);
  wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// delegate clicks (episodes list, recent episode cards)
root.addEventListener("click", (e) => {
  const epLink = e.target.closest(".episodes-list a[data-src]");
  if (epLink) { openPlayer(epLink.dataset.src, epLink.dataset.name); return; }
  const epCard = e.target.closest(".episode-card[data-src]");
  if (epCard) { openPlayer(epCard.dataset.src, epCard.dataset.name); return; }
});

window.addEventListener("hashchange", route);
window.addEventListener("DOMContentLoaded", init);

async function init() {
  await loadData();
  buildHeaderMenus();
  route();
  initSearch();
  initMobile();
  highlightNav();
}

// ------------- Header menus -------------
function buildHeaderMenus() {
  const gMenu = document.getElementById("genres-menu");
  const cMenu = document.getElementById("countries-menu");
  if (gMenu) {
    gMenu.innerHTML = (CATALOG.genresList || [])
      .filter((g) => g.name && !g.name.includes("&amp;"))
      .map((g) => `<li><a href="#/genero/${encodeURIComponent(g.slug)}">${esc(g.name)}</a></li>`)
      .join("");
  }
  if (cMenu) {
    cMenu.innerHTML = (CATALOG.countriesList || [])
      .map((c) => `<li><a href="#/pais/${encodeURIComponent(c.slug)}">${esc(c.name)}</a></li>`)
      .join("");
  }
}

function highlightNav() {
  const hash = location.hash.replace(/^#\//, "").split("/")[0];
  const map = { peliculas: "peliculas", series: "series" };
  header.querySelectorAll("a[data-route]").forEach((a) => {
    a.parentElement.classList.toggle("active", a.dataset.route === map[hash]);
  });
}

// ------------- Search -------------
function initSearch() {
  const form = document.getElementById("searchform");
  const formMob = document.getElementById("searchform-mob");
  const s = document.getElementById("s");

  const doSearch = (q) => {
    q = q.trim().toLowerCase();
    if (!q) { location.hash = "#/"; return; }
    const res = allItems().filter(
      (x) => x.title.toLowerCase().includes(q) || (x.originalTitle || "").toLowerCase().includes(q)
    );
    root.innerHTML = `
      <h1 class="page-title">Resultados para "${esc(q)}"</h1>
      <p class="count-results">${res.length} títulos</p>
      ${res.length ? `<div class="items">${res.map(card).join("")}</div>` : `<div class="empty">Sin resultados.</div>`}`;
    highlightNav();
  };

  if (form) form.addEventListener("submit", (e) => { e.preventDefault(); doSearch(s.value); });
  if (formMob) formMob.addEventListener("submit", (e) => { e.preventDefault(); doSearch(document.getElementById("s-mob").value); if (header.classList.contains("open")) toggleMenu(); });

  // desktop + mobile search buttons
  const resp = document.getElementById("search-resp");
  if (resp) resp.addEventListener("click", () => {
    const existing = document.querySelector(".search-mobile-bar");
    if (existing) { existing.remove(); return; }
    const bar = document.createElement("div");
    bar.className = "search-mobile-bar";
    bar.innerHTML = `<form><input type="text" id="s-mob-bar" placeholder="Buscar películas, series..." /><button type="submit" class="search-button"><span class="fas fa-search"></span></button></form>`;
    header.insertAdjacentElement("afterend", bar);
    bar.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      doSearch(bar.querySelector("input").value);
      bar.remove();
    });
    bar.querySelector("input").focus();
  });
}

// ------------- Mobile menu -------------
function initMobile() {
  const bars = document.getElementById("mob-bars");
  const nav = document.querySelector(".head-main-nav");
  if (bars && nav) bars.addEventListener("click", () => toggleMenu());
  // close menu when clicking a nav link
  window.addEventListener("click", (e) => {
    if (nav && nav.classList.contains("open") && !e.target.closest("header.main")) toggleMenu();
  });
}
function toggleMenu() {
  const nav = document.querySelector(".head-main-nav");
  nav.classList.toggle("open");
}