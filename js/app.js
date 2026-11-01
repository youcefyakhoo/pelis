// PelisLatinoHD clone - static SPA (history router)
// Home slider + modules, paginated listings, genre/country/tag pages, series
// episodes and a player panel whose sources come from data/servers.json.

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

// ------------- Google Ad Manager (GPT) grid helpers -------------
const gamBoxHTML = () => '<div class="item ad-in-grid ad-box" id="div-gpt-ad-sidebar"></div>';
const ad468x60Home = '<div class="ad-slot ad-desktop-only" id="div-gpt-ad-468x60"></div>';
const ad160x600Home = '<div class="ad-slot ad-desktop-only" id="div-gpt-ad-160x600"></div>';
const ad160x300Detail = '<div class="ad-slot ad-desktop-only" id="div-gpt-ad-160x300"></div>';
const adMount = () => {};
function withGridAds(cards) {
  const n = cards.length;
  if (!n) return "";
  const ads = [gamBoxHTML()];
  if (n < 4) return cards.concat(ads).join("");
  const min = 1;
  const max = n - 1;
  const p = min + Math.floor(Math.random() * (max - min));
  const out = cards.slice();
  out.splice(p, 0, ads[0]);
  return out.join("");
}

let CATALOG = { movies: [], series: [], genres: {}, countries: {}, genresList: [], countriesList: [], tags: {}, recentEpisodes: [], meta: {} };
let loaded = false;

const root = document.getElementById("main-content");
const header = document.querySelector("header.main");

function getRouteParts() {
  // Quita el prefijo del despliegue (/pelis/ en GitHub Pages) y las barras.
  const withoutBase = window.location.pathname.startsWith(SITE_BASE)
    ? window.location.pathname.slice(SITE_BASE.length)
    : window.location.pathname.replace(/^\//, "");
  // Admite temporalmente los enlaces antiguos con hash.
  // Cuando todos los enlaces hayan sido migrados, se puede eliminar el fallback.
  const cleanPath = withoutBase.replace(/^\/+|\/+$/g, "");

  if (cleanPath) return cleanPath.split("/").filter(Boolean);

  return window.location.hash
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean);
}

// Raíz del despliegue. En GitHub Pages el sitio vive en /<repo>/, así que las
// rutas internas se construyen con este prefijo en vez de asumir "/".
const SITE_BASE = (() => {
  const base = new URL(".", document.baseURI).pathname || "/";
  return base.endsWith("/") ? base : `${base}/`;
})();
const withBase = (path) => SITE_BASE + String(path ?? "").replace(/^\/+/, "");

function routeUrl(path) {
  return withBase(`/${String(path).replace(/^\/+/, "")}`);
}

// Convierte un href del DOM en la ruta interna de la SPA ("/peliculas") o null
// si es externo, un ancla o una ficha estática (esas cargan página completa).
function internalPath(link) {
  const raw = link.getAttribute("href") || "";
  if (!raw || raw.startsWith("#") || raw.startsWith("javascript:")) return null;
  if (link.target && link.target !== "_self") return null;
  let url;
  try {
    url = new URL(raw, document.baseURI);
  } catch {
    return null;
  }
  if (url.origin !== location.origin) return null;
  if (!url.pathname.startsWith(SITE_BASE)) return null;
  return `/${url.pathname.slice(SITE_BASE.length)}`;
}

// Reescribe enlaces absolutos heredados (plantillas antiguas con href="/x")
// para que apunten al prefijo del despliegue.
function normalizeInternalLinks(scope) {
  const rootNode = scope || document;
  rootNode.querySelectorAll('a[href^="/"]').forEach((a) => {
    const href = a.getAttribute("href");
    if (!href || href.startsWith("//") || href.startsWith(SITE_BASE)) return;
    a.setAttribute("href", withBase(href));
  });
}

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

// ------------- Player sources (data/servers.json) -------------
// El reproductor no lleva ningún host incrustado: las opciones se resuelven en
// tiempo de ejecución desde data/servers.json. Admite enlaces a servicios
// oficiales (tráiler, fichas, plataformas) y embeds de contenido propio o
// licenciado. Ver PLAYER.md para el esquema y los marcadores disponibles.
const SERVERS_URL = "data/servers.json";
const PLAYER_FALLBACK_CONFIG = {
  sources: [{
    id: "trailer",
    name: "Tráiler oficial",
    kind: "link",
    icon: "▶",
    primary: true,
    order: 10,
    url: "https://www.youtube.com/results?search_query={query}%20tr%C3%A1iler%20espa%C3%B1ol",
  }],
  providers: [],
};
let SERVERS = null;
let SERVERS_PROMISE = null;

// [player-sources:start]
// Funciones puras (sin DOM); también las usa scripts/check-player-sources.mjs.
function playerValues(ctx) {
  const c = ctx || {};
  const text = (v) => String(v == null ? "" : v).trim();
  const enc = (v) => encodeURIComponent(text(v));
  const type = text(c.type) === "series" ? "series" : "movie";
  const query = enc([text(c.title), text(c.year)].filter(Boolean).join(" ")).replace(/%20/g, "+");
  return {
    type: enc(type),
    media: enc(type === "series" ? "tv" : "movie"),
    title: enc(c.title),
    query,
    year: enc(c.year),
    tmdb: enc(c.tmdb),
    imdb: enc(c.imdb),
    slug: enc(c.slug),
    season: enc(c.season),
    episode: enc(c.episode),
    trailerKey: enc(c.trailerKey),
    episodeLabel: enc(c.season && c.episode ? `T${text(c.season)}E${text(c.episode)}` : ""),
  };
}

function playerFill(template, values) {
  if (!template) return null;
  let missing = false;
  const out = String(template).replace(/\{([a-zA-Z]+)\}/g, (m, key) => {
    const val = values[key];
    if (!val) { missing = true; return ""; }
    return val;
  });
  return missing ? null : out;
}

function resolvePlayerSources(config, ctx) {
  const cfg = config || {};
  const type = ctx && ctx.type === "series" ? "series" : "movie";
  const values = playerValues(ctx);
  const isEpisode = Boolean(values.season && values.episode);
  const result = { embeds: [], links: [], providers: [] };
  const byOrder = (a, b) => a.order - b.order;

  for (const src of cfg.sources || []) {
    if (!src || src.enabled === false) continue;
    const applies = Array.isArray(src.appliesTo) && src.appliesTo.length ? src.appliesTo : ["movie", "series"];
    if (!applies.includes(type)) continue;
    const template = isEpisode && src.episodeUrl ? src.episodeUrl : src.url;
    const url = playerFill(template, values);
    if (!url) continue;
    const entry = {
      id: src.id,
      name: src.name || src.id,
      icon: src.icon || "",
      url,
      primary: Boolean(src.primary),
      order: Number(src.order) || 100,
    };
    (src.kind === "embed" ? result.embeds : result.links).push(entry);
  }

  for (const p of cfg.providers || []) {
    if (!p || p.enabled === false) continue;
    const url = playerFill(p.url, values);
    if (url) result.providers.push({ id: p.id, name: p.name || p.id, url, order: Number(p.order) || 100 });
  }

  result.embeds.sort(byOrder);
  result.links.sort(byOrder);
  result.providers.sort(byOrder);
  return result;
}
// [player-sources:end]

async function loadServers() {
  if (SERVERS) return SERVERS;
  if (!SERVERS_PROMISE) {
    SERVERS_PROMISE = (async () => {
      try {
        const res = await fetch(SERVERS_URL, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const cfg = await res.json();
        if (!cfg || !Array.isArray(cfg.sources)) throw new Error("formato inválido");
        SERVERS = { sources: cfg.sources, providers: Array.isArray(cfg.providers) ? cfg.providers : [] };
      } catch (e) {
        console.warn(`[player] no se pudo cargar ${SERVERS_URL}; usando solo el tráiler`, e);
        SERVERS = PLAYER_FALLBACK_CONFIG;
      }
      return SERVERS;
    })();
  }
  return SERVERS_PROMISE;
}

// ------------- helpers -------------
const allItems = () => [...CATALOG.movies, ...CATALOG.series];
const genreName = (id) => CATALOG.genres[id] || "";
const countryName = (id) => CATALOG.countries[id] || "";
const genreSlug = (id) => {
  const g = (CATALOG.genresList || []).find((x) => String(x.id) === String(id));
  return g ? g.slug : null;
};
const countrySlug = (id) => {
  const c = (CATALOG.countriesList || []).find((x) => String(x.id) === String(id));
  return c ? c.slug : null;
};
const countrySlugByName = (name) => {
  const c = (CATALOG.countriesList || []).find((x) => x.name.toLowerCase() === String(name || "").toLowerCase());
  return c ? c.slug : null;
};

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
  const href = routeUrl(`detalle/${item.type}/${item.slug}/`);
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
  // find the serie to link detail (the hash opens the episode panel there)
  const serie = CATALOG.series.find((s) => s.title.toLowerCase() === String(ep.serie || "").toLowerCase());
  const label = `T${ep.season} E${ep.episode}`;
  const href = serie
    ? routeUrl(`detalle/series/${serie.slug}/#t${ep.season}e${ep.episode}`)
    : routeUrl("episodios/");
  const poster = serie ? serie.poster : null;
  return `
  <a class="episode-card" href="${esc(href)}">
    ${poster ? `<img src="${esc(poster)}" alt="" loading="lazy" style="width:100%;aspect-ratio:2/1;object-fit:cover;border-radius:6px;margin-bottom:8px;"/>` : ""}
    <div class="ep-title">${esc(ep.serie)}</div>
    <div class="ep-meta">${esc(ep.title)} &middot; <b>${label}</b></div>
  </a>`;
}

function renderModule(title, items, link, icon, ads) {
  return `
  <section class="module">
    <div class="content">
      <header>
        <h2>${icon || ""} ${esc(title)}</h2>
        ${link ? `<a class="see-all" href="${link}">Ver todo <span class="fas fa-angle-right"></span></a>` : ""}
      </header>
      <div class="items">${ads ? withGridAds(items.map(card)) : items.map(card).join("")}</div>
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
      <div class="slide" style="${bgStyle}" onclick="location.href='/detalle/${it.type}/${it.slug}/'">
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
    const h = href ? `href="${withBase(href)}"` : "";
    return `<a class="arrow_pag ${cls || ""} ${disabled ? "disabled" : ""}" ${h}>${label}</a>`;
  };
  let nums = "";
  const start = Math.max(1, p - 2);
  const end = Math.min(pages, p + 2);
  if (start > 1) { nums += `<a class="inactive" href="${withBase(`${base}/1`)}">1</a>`; if (start > 2) nums += `<span class="dots">...</span>`; }
  for (let k = start; k <= end; k++) {
    nums += k === p ? `<span class="current">${k}</span>` : `<a class="inactive" href="${withBase(`${base}/${k}`)}">${k}</a>`;
  }
  if (end < pages) { if (end < pages - 1) nums += `<span class="dots">...</span>`; nums += `<a class="inactive" href="${withBase(`${base}/${pages}`)}">${pages}</a>`; }
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
    <div class="items">${withGridAds(slice.map(card))}</div>
    ${pagination(items.length, p, base)}`;
}

// ------------- Router -------------
async function route() {
  await loadData();
  const parts = getRouteParts();

  if (!parts.length) return renderHome();

  switch (parts[0]) {
    case "home": return renderHome();
    case "peliculas": return renderMovies(parts[1], parts[2]);
    case "series": return renderListing("Series", CATALOG.series, parts[1], "/series");
    case "episodios": return renderEpisodesPage(parts[1]);
    case "tendencias": return renderTendencias(parts[1]);
    case "imdb": return renderIMDb(parts[1]);
    case "animes": return renderTag("anime", parts[1]);
    case "tag": return parts[1] ? renderTagByName(parts[1], parts[2]) : renderHome();
    case "genero": return parts[1] ? renderGenre(parts[1], parts[2], parts[3]) : renderHome();
    case "pais": return parts[1] ? renderCountry(parts[1], parts[2], parts[3]) : renderHome();
    case "detalle": return parts[1] && parts[2] ? renderDetail(parts[1], parts[2]) : renderHome();
    case "privacidad": return renderLegalPage("privacidad");
    case "terminos": return renderLegalPage("terminos");
    case "cookies": return renderLegalPage("cookies");
    case "contacto": return renderLegalPage("contacto");
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
  html += ad468x60Home;
  html += renderModule("Películas Latino HD", movies.slice(0, HOME_ITEMS), "/peliculas", `<span class="fas fa-film"></span>`, true);
  html += `
    <section class="module">
      <div class="content ad-fluid">
        <div class="ad-fluid-main">
          <header><h2><span class="fas fa-tv"></span> Nuevos Episodios</h2><a class="see-all" href="${withBase("/episodios")}">Ver todo <span class="fas fa-angle-right"></span></a></header>
          <div class="episodes-row" id="recent-episodes">${recentEpisodes.slice(0, 12).map(episodeHomeCard).join("")}</div>
        </div>
        <aside class="ad-skyscraper">${ad160x600Home}</aside>
      </div>
    </section>`;
  html += renderModule("Series destacadas", series.slice(0, HOME_ITEMS), "/series", `<span class="fas fa-th-list"></span>`, true);
  html += renderModule("Animes", animeItems.slice(0, HOME_ITEMS), "/animes", `<span class="fas fa-fire"></span>`, true);
  html += renderModule("Superhéroes", superheroItems.slice(0, HOME_ITEMS), "/tag/superhero", `<span class="fas fa-bolt"></span>`, true);
  html += renderModule("Animados", cartoonItems.slice(0, HOME_ITEMS), "/tag/cartoon", `<span class="fas fa-paint-brush"></span>`, true);

  root.innerHTML = html;
  initSlider();
  adMount();
}

// ------------- Listing (paged grid) -------------
function renderListing(title, items, pageStr, base) {
  const page = parseInt(pageStr, 10) || 1;
  const sorted = [...items].sort((a, b) => (b.year || 0) - (a.year || 0));
  root.innerHTML = `
    <h1 class="page-title">${esc(title)}</h1>
    <p class="count-results">${items.length} títulos</p>
    ${paginatedList(sorted, page, base)}
    ${ad160x300Detail}`;
  adMount();
}

// Alphabet index (A-Z) used by the movies listing, like the original site.
const LETTERS = "#ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function alphaIndex(currentLetter) {
  const norm = (s) => String(s || "").toUpperCase();
  const items = [];
  for (const ch of LETTERS) {
    const letter = ch === "#" ? "#" : ch;
    const active = currentLetter === letter;
    items.push(active
      ? `<li class="active"><span>${letter}</span></li>`
      : `<li><a href="${withBase(`/peliculas/${letter === "#" ? "#" : letter}`)}">${letter}</a></li>`);
  }
  return `<ul class="glossary">${items.join("")}</ul>`;
}

function firstLetter(item) {
  const t = String(item.title || "").trim();
  const ch = t.charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

// Movies page: alphabetical glossary + paged grid, one letter at a time.
function renderMovies(letter, pageStr) {
  const key = letter !== undefined ? String(letter).toUpperCase() : null;
  const page = parseInt(pageStr, 10) || 1;
  const all = [...CATALOG.movies].sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "es"));
  const lettered = key ? all.filter((x) => firstLetter(x) === key) : all;
  const paged = paginatedList(lettered, page, `/peliculas/${key ? (key === "#" ? "#" : key) : "#"}`);
  root.innerHTML = `
    <h1 class="page-title">Películas</h1>
    <p class="count-results">${lettered.length} títulos${key ? ` · letra ${esc(key)}` : ""}</p>
    ${alphaIndex(key)}
    ${paged}`;
  adMount();
}

function renderTendencias(pageStr) {
  const page = parseInt(pageStr, 10) || 1;
  const items = allItems().filter((x) => x.rating > 0).sort((a, b) => b.rating - a.rating);
  root.innerHTML = `
    <h1 class="page-title">Tendencias</h1>
    <p class="count-results">${items.length} títulos</p>
    ${paginatedList(items, page, "/tendencias")}`;
  adMount();
}

function renderIMDb(pageStr) {
  const page = parseInt(pageStr, 10) || 1;
  const items = allItems().filter((x) => x.rating > 0).sort((a, b) => b.rating - a.rating);
  root.innerHTML = `
    <h1 class="page-title"><span class="fas fa-star"></span> Ranking IMDb</h1>
    <p class="count-results">${items.length} títulos</p>
    ${paginatedList(items, page, "/imdb")}`;
  adMount();
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
    ${pagination(eps.length, p, "/episodios")}`;
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
    ${paginatedList(items, page, `/tag/${slug}`)}`;
  adMount();
}

// Type-filter tabs used by genre/country pages (like the original site).
function typeFilterTabs(base, type) {
  const t = (label, val) => `<a class="${(!val && !type) || type === val ? "selected" : ""}" href="${withBase(`${base}${val ? `/${val}` : ""}`)}">${esc(label)}</a>`;
  return `<nav class="releases">${t("Añadido recientemente", "")}${t("Películas", "movies")}${t("Series", "tv")}</nav>`;
}

function renderGenre(slug, seg2, seg3) {
  // seg2 = "movies"|"tv"|<page number>|undefined ; seg3 = page (when seg2 is a type)
  const type = seg2 === "movies" || seg2 === "tv" ? seg2 : null;
  const page = parseInt(type ? seg3 : seg2, 10) || 1;
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const target = (CATALOG.genresList || []).find((g) => g.slug === slug || String(g.id) === slug || norm(g.name) === norm(slug));
  const gid = target ? target.id : Object.keys(CATALOG.genres).find((id) => norm(genreName(id)) === norm(slug));
  const name = target ? target.name : (gid ? genreName(gid) : slug);
  const base = gid ? `/genero/${genreSlug(gid)}` : `/genero/${slug}`;
  const pool = type === "movies" ? CATALOG.movies : type === "tv" ? CATALOG.series : allItems();
  const items = pool
    .filter((x) => (x.genres || []).includes(gid ? Number(gid) : -1))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  root.innerHTML = `
    <h1 class="page-title">Género: ${esc(name)}</h1>
    ${typeFilterTabs(base, type)}
    <p class="count-results">${items.length} títulos</p>
    ${paginatedList(items, page, `${base}${type ? `/${type}` : ""}`)}`;
  adMount();
}

function renderCountry(slug, seg2, seg3) {
  const type = seg2 === "movies" || seg2 === "tv" ? seg2 : null;
  const page = parseInt(type ? seg3 : seg2, 10) || 1;
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const target = (CATALOG.countriesList || []).find((c) => c.slug === slug || String(c.id) === slug || norm(c.name) === norm(slug));
  const cid = target ? target.id : Object.keys(CATALOG.countries).find((id) => norm(countryName(id)) === norm(slug));
  const name = target ? target.name : (cid ? countryName(cid) : slug);
  const base = cid ? `/pais/${countrySlug(cid)}` : `/pais/${slug}`;
  const pool = type === "movies" ? CATALOG.movies : type === "tv" ? CATALOG.series : allItems();
  const items = pool
    .filter((x) => (x.countries || []).includes(cid ? Number(cid) : -1))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  root.innerHTML = `
    <h1 class="page-title">País: ${esc(name)}</h1>
    ${typeFilterTabs(base, type)}
    <p class="count-results">${items.length} títulos</p>
    ${paginatedList(items, page, `${base}${type ? `/${type}` : ""}`)}`;
  adMount();
}

// ------------- Legal / information pages -------------
function updateLegalSEO(kind) {
  const seo = {
    privacidad: {
      title: "Política de Privacidad | PelisLatinoHD",
      description: "Conoce cómo PelisLatinoHD puede procesar datos técnicos, utilizar servicios de terceros y proteger la privacidad de sus visitantes."
    },
    terminos: {
      title: "Términos de Uso | PelisLatinoHD",
      description: "Consulta las condiciones de uso de PelisLatinoHD, el alcance del sitio, los enlaces externos, la publicidad y las responsabilidades del visitante."
    },
    cookies: {
      title: "Política de Cookies | PelisLatinoHD",
      description: "Conoce qué son las cookies, cómo pueden utilizarse en PelisLatinoHD y cómo gestionar tus preferencias desde el navegador."
    },
    contacto: {
      title: "Contacto | PelisLatinoHD",
      description: "Encuentra el correo de contacto de PelisLatinoHD para consultas sobre privacidad, derechos de autor, publicidad y funcionamiento del sitio."
    }
  };
  const data = seo[kind] || seo.privacidad;
  const canonical = `${window.location.origin}${withBase(`/${kind}`)}`;

  document.title = data.title;
  const setMeta = (selector, attribute, value) => {
    let meta = document.head.querySelector(selector);
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute(attribute.split("=")[0], attribute.split("=")[1]);
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", value);
  };
  setMeta('meta[name="description"]', "name=description", data.description);
  setMeta('meta[name="robots"]', "name=robots", "index,follow");
  setMeta('meta[property="og:type"]', "property=og:type", "website");
  setMeta('meta[property="og:title"]', "property=og:title", data.title);
  setMeta('meta[property="og:description"]', "property=og:description", data.description);
  setMeta('meta[property="og:url"]', "property=og:url", canonical);
  setMeta('meta[name="twitter:card"]', "name=twitter:card", "summary");
  setMeta('meta[name="twitter:title"]', "name=twitter:title", data.title);
  setMeta('meta[name="twitter:description"]', "name=twitter:description", data.description);

  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", canonical);
}

async function renderLegalPage(kind) {
  const validKinds = ["privacidad", "terminos", "cookies", "contacto"];
  const pageKind = validKinds.includes(kind) ? kind : "privacidad";
  const url = withBase(`/legal/${pageKind}.html`);
  updateLegalSEO(pageKind);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    root.innerHTML = html;
  } catch (error) {
    console.error(`Error cargando ${url}:`, error);
    root.innerHTML = `
      <article class="legal-page">
        <p class="legal-kicker">Información del sitio</p>
        <h1 class="page-title">Error</h1>
        <div class="legal-content">
          <p>No se pudo cargar el contenido de esta página. Inténtalo de nuevo más tarde.</p>
        </div>
        <a class="back legal-back" href="${withBase("/")}">&larr; Volver al inicio</a>
      </article>`;
  }
}

// ------------- Detail -------------
// Social bar (compartir) del detalle
function renderSocialBar(item) {
  const url = encodeURIComponent(`${location.origin}${location.pathname}${location.search}`);
  const t = encodeURIComponent(item.title);
  return `
  <div class="social-bar">
    <span class="sb-label">Compartir:</span>
    <a class="sb-btn sb-fb" rel="noopener" target="_blank" href="https://www.facebook.com/sharer/sharer.php?u=${url}" aria-label="Facebook">f</a>
    <a class="sb-btn sb-x" rel="noopener" target="_blank" href="https://twitter.com/intent/tweet?url=${url}&text=${t}" aria-label="X">X</a>
    <a class="sb-btn sb-wa" rel="noopener" target="_blank" href="https://api.whatsapp.com/send?text=${t}%20${url}" aria-label="WhatsApp">&#10003;</a>
    <a class="sb-btn sb-tg" rel="noopener" target="_blank" href="https://t.me/share/url?url=${url}&text=${t}" aria-label="Telegram">&#9992;</a>
  </div>`;
}

function renderDetail(type, slug) {
  const item = findBySlug(type, slug);
  if (!item) { root.innerHTML = `<div class="empty">No se encontró el título.</div>`; return; }

  const genres = (item.genres || [])
    .map((gid) => ({ name: genreName(gid), slug: genreSlug(gid) }))
    .filter((g) => g.name)
    .map((g) => `<a href="${withBase(`/genero/${encodeURIComponent(g.slug || g.name)}`)}">${esc(g.name)}</a>`)
    .join("");

  const metaSpans = `
    ${item.year ? `<span>${esc(item.year)}</span>` : ""}
    ${item.runtime ? `<span>${esc(item.runtime)} min</span>` : ""}
    ${item.country ? (() => { const cs = countrySlugByName(item.country); return `<span>${cs ? `<a href="${withBase(`/pais/${encodeURIComponent(cs)}`)}">${esc(item.country)}</a>` : esc(item.country)}</span>`; })() : ""}
    ${item.rated ? `<span>${esc(item.rated)}</span>` : ""}
    ${item.rating ? `<span class="rate">★ IMDb ${item.rating.toFixed(1)}</span>` : ""}
    ${item.tmdbRating ? `<span class="rate">★ TMDb ${item.tmdbRating.toFixed(1)}</span>` : ""}
    ${item.seasons ? `<span>${esc(item.seasons)} temporada${item.seasons > 1 ? "s" : ""}</span>` : ""}
    ${item.episodesCount ? `<span>${esc(item.episodesCount)} episodios</span>` : ""}
  `;

  const ratingsBlock = (item.rating || item.tmdbRating) ? `
    <div class="ratings">
      ${item.rating ? `<div class="rating-box"><span class="rb-val">★ ${item.rating.toFixed(1)}</span><span class="rb-label">IMDb</span>${item.imdbVotes ? `<span class="rb-votes">${esc(Number(item.imdbVotes).toLocaleString("es"))} votos</span>` : ""}</div>` : ""}
      ${item.tmdbRating ? `<div class="rating-box"><span class="rb-val">★ ${item.tmdbRating.toFixed(1)}</span><span class="rb-label">TMDb</span>${item.tmdbVotes ? `<span class="rb-votes">${esc(Number(item.tmdbVotes).toLocaleString("es"))} votos</span>` : ""}</div>` : ""}
    </div>` : "";

  const wrapId = `player-${item.slug}`;
  const playBtn = `<button class="play-btn" data-player="${esc(wrapId)}" ${ctxAttrs(item)}><span class="fas fa-play"></span> Reproducir</button>`;

  const episodeSection = item.type === "series" && item.episodes && item.episodes.length
    ? renderEpisodes(item)
    : "";

  const directorBlock = (item.director && item.director.length)
    ? peopleBlock(item.type === "series" ? "Creador" : "Director", item.director, false)
    : (item.creator && item.creator.length ? peopleBlock("Creador", item.creator, false) : "");

  const castBlock = (item.cast && item.cast.length) ? peopleBlock("Reparto", item.cast, true) : "";

  const keywordsBlock = (item.keywords && item.keywords.length)
    ? `<div class="keywords"><span class="kw-label">Etiquetas:</span>${item.keywords.slice(0, 10).map((k) => `<span class="kw">${esc(k)}</span>`).join("")}</div>`
    : "";

  // The original shows a "Sinopsis" block whose body is the description, or the
  // keywords when there is no description (some titles have no synopsis at all).
  const synopsisText = (item.synopsis || "").trim();
  const synopsisBlock = synopsisText
    ? `<p class="synopsis">${esc(synopsisText)}</p>`
    : "";

  const relatedBlock = renderRelated(item);

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
          ${ratingsBlock}
          ${synopsisBlock}
          ${keywordsBlock}
          ${genres ? `<div class="genres">${genres}</div>` : ""}
          ${renderSocialBar(item)}
          ${playBtn}
        </div>
      </div>
      <div class="player-wrap" id="${esc(wrapId)}"></div>
      ${episodeSection}
      ${directorBlock}
      ${castBlock}
      ${relatedBlock}
    </section>`;

  bindSeasonAccordion();
  adMount();
  openEpisodeFromHash(item);
}

// TMDB id: movies carry `tmdb`; series often expose it as a numeric externalId.
function tmdbId(item) {
  const raw = String((item && (item.tmdb || item.externalId)) || "").trim();
  return /^\d+$/.test(raw) ? raw : "";
}

// IMDb ids look like "tt0081249"; anything else is not a usable IMDb link.
function imdbId(item) {
  const raw = String((item && (item.imdb || item.externalId)) || "").trim();
  return /^tt\d+$/i.test(raw) ? raw : "";
}

// data-* attributes carrying the context the source resolver needs.
function ctxAttrs(item, ep) {
  const attrs = {
    "data-type": item.type,
    "data-title": item.title,
    "data-year": item.year || "",
    "data-tmdb": tmdbId(item),
    "data-imdb": imdbId(item),
    "data-slug": item.slug,
  };
  if (ep) {
    attrs["data-season"] = ep.season;
    attrs["data-episode"] = ep.episode;
  }
  return Object.entries(attrs)
    .filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(" ");
}

function ctxFromEl(node) {
  const d = node.dataset || {};
  return {
    type: d.type || "movie",
    title: d.title || "",
    year: d.year || "",
    tmdb: d.tmdb || "",
    imdb: d.imdb || "",
    slug: d.slug || "",
    season: d.season || "",
    episode: d.episode || "",
  };
}

const PROVIDER_TYPE_LABEL = { flatrate: "Suscripción", free: "Gratis", ads: "Con anuncios", rent: "Alquiler", buy: "Compra" };

// "Dónde verlo": real availability from TMDB when the catalog was enriched,
// otherwise the generic per-platform search links from data/servers.json.
function providersBlock(ctx, resolved) {
  const real = Array.isArray(ctx.providers) ? ctx.providers : [];
  if (real.length) {
    const fallbackSearch = (id) => {
      const hit = (resolved.providers || []).find((p) => p.id === id);
      return hit ? hit.url : "";
    };
    const chips = real.slice(0, 8).map((p) => {
      const url = ctx.providerLink || fallbackSearch(p.id);
      if (!url) return "";
      const type = PROVIDER_TYPE_LABEL[p.type] ? `<span class="pp-provider-type">${esc(PROVIDER_TYPE_LABEL[p.type])}</span>` : "";
      const logo = p.logo ? `<img src="${esc(p.logo)}" alt="" loading="lazy" width="18" height="18"/>` : "";
      return `<a class="pp-provider pp-provider-real" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${logo}<span>${esc(p.name)}</span>${type}</a>`;
    }).join("");
    if (!chips) return "";
    return `
      <div class="pp-providers">
        <span class="pp-label">Dónde verlo${ctx.providersRegion ? ` (${esc(ctx.providersRegion)})` : ""}</span>
        <div class="pp-provider-btns">${chips}</div>
      </div>`;
  }
  if (!resolved.providers.length) return "";
  return `
      <div class="pp-providers">
        <span class="pp-label">Buscar en plataformas</span>
        <div class="pp-provider-btns">
          ${resolved.providers.map((p) => `<a class="pp-provider" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(p.name)}</a>`).join("")}
        </div>
      </div>`;
}

// Player slot: lists official/legal sources. Only embeds content when the
// configured source is an embed (own or licensed catalogue).
function playerPanelHTML(ctx, resolved) {
  const isEpisode = Boolean(ctx.season && ctx.episode);
  const label = isEpisode ? `${ctx.title} · T${ctx.season} E${ctx.episode}` : ctx.title;
  const embed = resolved.embeds[0];
  const frame = embed
    ? `
      <div class="pp-frame">
        <iframe src="${esc(embed.url)}" title="${esc(label)}" allowfullscreen scrolling="no" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture"></iframe>
      </div>
      ${resolved.embeds.length > 1
        ? `<div class="pp-tabs">${resolved.embeds.map((s, i) => `<button type="button" class="pp-tab${i === 0 ? " active" : ""}" data-url="${esc(s.url)}">${esc(s.name)}</button>`).join("")}</div>`
        : ""}`
    : "";
  const links = resolved.links.map((s) => `
      <a class="pp-btn${s.primary ? " pp-primary" : ""}" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer nofollow">
        ${s.icon ? `<span class="pp-ico">${esc(s.icon)}</span>` : ""}<span>${esc(s.name)}</span>
      </a>`).join("");
  const providers = providersBlock(ctx, resolved);

  return `
    <div class="pp">
      <div class="pp-head">
        <div class="pp-title">
          <span class="pp-kicker">${isEpisode ? "Episodio" : "Título"}</span>
          <h3>${esc(label)}</h3>
        </div>
        <button type="button" class="pp-close" aria-label="Cerrar reproductor">&#10005;</button>
      </div>
      ${frame}
      <div class="pp-body">
        <p class="pp-note">Este sitio no aloja ni transmite contenido. Las opciones abren servicios oficiales o el catálogo licenciado del sitio.</p>
        ${links ? `<div class="pp-links">${links}</div>` : `<p class="pp-empty">No hay fuentes configuradas en <code>data/servers.json</code>.</p>`}
        ${providers}
      </div>
    </div>`;
}

function bindPlayerPanel(wrap) {
  const close = wrap.querySelector(".pp-close");
  if (close) close.addEventListener("click", () => {
    wrap.classList.remove("active", "panel-mode");
    wrap.innerHTML = "";
  });
  wrap.querySelectorAll(".pp-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const frame = wrap.querySelector(".pp-frame iframe");
      if (frame) frame.src = tab.dataset.url;
      wrap.querySelectorAll(".pp-tab").forEach((t) => t.classList.toggle("active", t === tab));
    });
  });
}

async function showPlayerPanel(wrapId, ctx) {
  let wrap = document.getElementById(wrapId);
  if (!wrap) {
    // Fallback: mount the slot right after the detail header, never at page top.
    wrap = document.createElement("div");
    wrap.id = wrapId;
    wrap.className = "player-wrap";
    const head = root.querySelector(".detail-head");
    if (head && head.parentElement) head.after(wrap);
    else root.insertBefore(wrap, root.firstChild);
  }
  ctx = { ...ctx, ...extrasFor(ctx) };
  wrap.classList.add("active", "panel-mode");
  wrap.innerHTML = `<div class="pp-loading">Cargando opciones…</div>`;
  const config = await loadServers();
  if (!wrap.isConnected) return;
  const resolved = resolvePlayerSources(config, ctx);
  wrap.innerHTML = playerPanelHTML(ctx, resolved);
  bindPlayerPanel(wrap);
  wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Deep link from an episode card: /detalle/series/<slug>/#t1e5
function openEpisodeFromHash(item) {
  const m = String(location.hash || "").match(/^#t(\d+)e(\d+)$/i);
  if (!m || item.type !== "series") return;
  const season = String(Number(m[1]));
  const episode = String(Number(m[2]));
  const ep = (item.episodes || []).find(
    (x) => String(x.season) === season && String(x.episode) === episode
  );
  if (!ep) return;
  showPlayerPanel(`player-${item.slug}`, { ...ctxFromItem(item), season: ep.season, episode: ep.episode });
}

// Extra data stored in the catalog by scripts/enrich-tmdb.mjs
// (trailerKey / providers / providerLink). Empty when not enriched yet.
function extrasFor(ctx) {
  const list = ctx.type === "series" ? CATALOG.series : CATALOG.movies;
  const item = (list || []).find((x) => x.slug === ctx.slug);
  if (!item) return {};
  return {
    trailerKey: item.trailerKey || "",
    trailerName: item.trailerName || "",
    providers: Array.isArray(item.providers) ? item.providers : [],
    providerLink: item.providerLink || "",
  };
}

function ctxFromItem(item) {
  return {
    type: item.type,
    title: item.title,
    year: item.year || "",
    tmdb: tmdbId(item),
    imdb: imdbId(item),
    slug: item.slug,
    trailerKey: item.trailerKey || "",
    providers: Array.isArray(item.providers) ? item.providers : [],
    providerLink: item.providerLink || "",
  };
}

// Person/people block (Director, Creador, Reparto)
function peopleBlock(title, people, showRoles) {
  const chips = people.map((p) => `
    <div class="person">
      ${p.photo && !p.photo.endsWith("/null") ? `<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none'"/>` : `<div class="person-avatar">${esc((p.name || "?").charAt(0))}</div>`}
      <div class="person-meta">
        <span class="person-name">${esc(p.name)}</span>
        ${showRoles && p.role ? `<span class="person-role">${esc(p.role)}</span>` : ""}
      </div>
    </div>`).join("");
  return `<section class="people-section"><h2 class="sec-title">${esc(title)}</h2><div class="people">${chips}</div></section>`;
}

// "Títulos similares" - items sharing the most genres
function renderRelated(item) {
  const myGenres = item.genres || [];
  const scored = allItems()
    .filter((x) => x.slug !== item.slug)
    .map((x) => {
      const overlap = (x.genres || []).filter((g) => myGenres.includes(g)).length;
      return { x, overlap };
    })
    .filter((o) => o.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || (b.x.rating || 0) - (a.x.rating || 0))
    .slice(0, 12)
    .map((o) => o.x);
  if (!scored.length) return "";
  return `<section class="module related-module"><div class="content"><header><h2><span class="fas fa-clapperboard"></span> Títulos similares</h2></header><div class="items">${withGridAds(scored.map(card))}</div></div></section>`;
}

function renderEpisodes(show) {
  // group by season, keep original order
  const bySeason = {};
  for (const ep of show.episodes || []) {
    const s = ep.season || "1";
    (bySeason[s] = bySeason[s] || []).push(ep);
  }
  const seasons = Object.keys(bySeason).map(Number).sort((a, b) => a - b);
  return `
    <div class="seasons-block">
      <h2 class="sec-title">Temporadas y episodios</h2>
      <div class="seasons">
        ${seasons.map((s, i) => {
          const eps = bySeason[s].map((ep) => `
            <li>
              <a href="javascript:void(0)" data-player="player-${esc(show.slug)}" ${ctxAttrs(show, ep)}>
                <span class="num">T${ep.season} E${ep.episode}</span>
                <span class="episode-title">${esc(ep.title || `Episodio ${ep.episode}`)}</span>
                ${ep.date ? `<span class="ep-date">${esc(ep.date)}</span>` : ""}
              </a>
            </li>`).join("");
          // first season open by default (like the original shows most recent open)
          const open = i === 0;
          return `
          <div class="se-c">
            <div class="se-q ${open ? "open" : ""}">
              <span class="se-t">${s}</span>
              <span class="se-title">Temporada ${s}</span>
              <span class="se-o"></span>
            </div>
            <ul class="episodes-list" ${open ? "" : 'style="display:none;"'}>${eps}</ul>
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

// accordion: click a season header to expand/collapse its episodes
function bindSeasonAccordion() {
  root.querySelectorAll(".se-q").forEach((q) => {
    q.addEventListener("click", () => {
      const list = q.nextElementSibling;
      const open = q.classList.toggle("open");
      if (list) list.style.display = open ? "" : "none";
    });
  });
}

// delegate clicks on play buttons and episode rows -> source panel
root.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-player][data-type]");
  if (!trigger) return;
  const wrapId = trigger.getAttribute("data-player");
  if (!wrapId) return;
  e.preventDefault();
  showPlayerPanel(wrapId, ctxFromEl(trigger));
});

// Internal clean-route navigation. The static host only serves real files
// (detalle/... and the section pages), so /peliculas, /series, /genero/...,
// pagination etc. would 404 on a full page load. Intercept and render SPA-side.
// Detail routes (/detalle/...) are intentionally EXCLUDED: they must load via
// normal navigation so the server delivers the static HTML and Facebook/crawlers
// read the Open Graph metadata from the real file.
document.addEventListener("click", (e) => {
  const link = e.target.closest("a[href]");
  if (!link) return;
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const path = internalPath(link);
  if (!path) return;
  if (path.startsWith("/detalle/")) return;
  e.preventDefault();
  history.pushState({}, "", withBase(path));
  window.scrollTo(0, 0);
  route();
  highlightNav();
});

window.addEventListener("popstate", () => {
  window.scrollTo(0, 0);
  route();
  highlightNav();
});
window.addEventListener("DOMContentLoaded", init);

async function init() {
  await loadData();
  normalizeInternalLinks(document);
  buildHeaderMenus();
  route();
  initSearch();
  initMobile();
  highlightNav();
}

// ------------- Header menus -------------
// Nombres de países que muestra el menú del original (43). Los otros del catálogo quedan
// accesibles solo por URL (#/pais/<slug>), igual que en el original.
const HEADER_COUNTRIES = [
  "Argentina", "Australia", "Austria", "Belgium", "Brazil", "Bulgaria", "Canada", "Chile", "China",
  "Colombia", "Costa Rica", "Denmark", "Dominican Republic", "Ecuador", "Finland", "France", "Germany",
  "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Ireland", "Italy", "Japan", "Luxembourg",
  "Mexico", "Netherlands", "New Zealand", "Norway", "Panama", "Peru", "Philippines", "Poland", "Portugal",
  "Puerto Rico", "South Africa", "South Korea", "Spain", "United Kingdom", "United States", "Uruguay", "Venezuela"
];
const HEADER_COUNTRY_ALIASES = { "United States of America": "United States" };
function buildHeaderMenus() {
  const gMenu = document.getElementById("genres-menu");
  const cMenu = document.getElementById("countries-menu");
  if (gMenu) {
    gMenu.innerHTML = (CATALOG.genresList || [])
      .map((g) => `<li><a href="${withBase(`/genero/${encodeURIComponent(g.slug)}`)}">${esc(g.name)}</a></li>`)
      .join("");
  }
  if (cMenu) {
    const byName = {};
    (CATALOG.countriesList || []).forEach((c) => { byName[c.name] = c; byName[HEADER_COUNTRY_ALIASES[c.name] || c.name] = c; });
    cMenu.innerHTML = HEADER_COUNTRIES
      .map((name) => byName[name])
      .filter(Boolean)
      .map((c) => `<li><a href="${withBase(`/pais/${encodeURIComponent(c.slug)}`)}">${esc(HEADER_COUNTRY_ALIASES[c.name] || c.name)}</a></li>`)
      .join("");
  }
}

function highlightNav() {
  const currentRoute = getRouteParts()[0] || "";
  const map = { peliculas: "peliculas", series: "series" };
  header.querySelectorAll("a[data-route]").forEach((a) => {
    a.parentElement.classList.toggle("active", a.dataset.route === map[currentRoute]);
  });
}

// ------------- Search -------------
function initSearch() {
  const form = document.getElementById("searchform");
  const formMob = document.getElementById("searchform-mob");
  const s = document.getElementById("s");

  const doSearch = (q) => {
    q = q.trim().toLowerCase();
    if (!q) {
      history.pushState({}, "", withBase("/"));
      route();
      return;
    }
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
  if (formMob) formMob.addEventListener("submit", (e) => {
    e.preventDefault();
    doSearch(document.getElementById("s-mob").value);
    const nav = document.querySelector(".head-main-nav");
    if (nav && nav.classList.contains("open")) toggleMenu();
  });

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

  if (nav) nav.addEventListener("click", (e) => {
    if (window.innerWidth > 920) return;
    const li = e.target.closest("li.has-sub");
    const toggle = e.target.closest("li.has-sub > a");
    const link = e.target.closest("a");
    if (toggle && toggle.getAttribute("href") === "javascript:void(0)") {
      e.preventDefault();
      li.classList.toggle("open");
      return;
    }
    if (link) toggleMenu();
  });

  // close menu when clicking a nav link
  window.addEventListener("click", (e) => {
    if (nav && nav.classList.contains("open") && !e.target.closest("header.main")) toggleMenu();
  });
}
function toggleMenu() {
  const nav = document.querySelector(".head-main-nav");
  nav.classList.toggle("open");
}