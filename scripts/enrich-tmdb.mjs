// Enriquecimiento del catálogo con datos de TMDB (tráiler oficial + dónde verlo).
//
// Para cada título con id de TMDB pide /movie|tv/{id} con
// append_to_response=videos,watch/providers y guarda en el catálogo:
//   trailerKey, trailerName, trailerLang  -> tráiler oficial de YouTube
//   providers, providersRegion            -> plataformas oficiales del país
//   providerLink                          -> página "dónde verlo" de TMDB
//
// Sin credenciales no hace nada (exit 0), así el workflow sigue funcionando.
//
// Uso:
//   TMDB_API_KEY=xxx node scripts/enrich-tmdb.mjs
//   TMDB_TOKEN=xxx node scripts/enrich-tmdb.mjs --limit 50 --only-missing
//
// Variables: TMDB_API_KEY (v3) | TMDB_TOKEN (v4), TMDB_REGION (PE),
//            TMDB_LANG (es-ES), TMDB_BASE, TMDB_CONCURRENCY (8),
//            TMDB_TIMEOUT_MS (15000), PELIS_DATA_DIR
// Argumentos: --catalog <ruta> --limit <n> --only-missing --concurrency <n> --dry-run
import { readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
};
const hasFlag = (name) => argv.includes(`--${name}`);

const API_KEY = process.env.TMDB_API_KEY || "";
const TOKEN = process.env.TMDB_TOKEN || "";
const BASE = (process.env.TMDB_BASE || "https://api.themoviedb.org/3").replace(/\/+$/, "");
const REGION = String(process.env.TMDB_REGION || "PE").toUpperCase();
const LANG = process.env.TMDB_LANG || "es-ES";
const CONCURRENCY = Math.max(1, Number(arg("concurrency", process.env.TMDB_CONCURRENCY || 8)));
const TIMEOUT_MS = Math.max(1000, Number(process.env.TMDB_TIMEOUT_MS || 15000));
const LIMIT = Number(arg("limit", 0)) || 0;
const ONLY_MISSING = hasFlag("only-missing");
const DRY_RUN = hasFlag("dry-run");

function resolveCatalogPath() {
  const explicit = arg("catalog");
  if (typeof explicit === "string") return path.resolve(explicit);
  const candidates = [
    process.env.PELIS_DATA_DIR,
    path.join(ROOT, "data"),
    path.join(ROOT, "site", "data"),
  ].filter(Boolean).map((p) => path.resolve(p));
  const hit = candidates.find((p) => existsSync(path.join(p, "catalog.json")));
  return path.join(hit || candidates[0], "catalog.json");
}

if (!API_KEY && !TOKEN) {
  console.log("[tmdb] sin TMDB_API_KEY / TMDB_TOKEN: nada que hacer (el catálogo queda igual).");
  process.exit(0);
}

// ---- HTTP -------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(pathname, params = {}) {
  const url = new URL(`${BASE}${pathname}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));
  if (API_KEY) url.searchParams.set("api_key", API_KEY);

  for (let attempt = 0; attempt < 4; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const headers = { accept: "application/json" };
      if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
      const res = await fetch(url, { headers, signal: controller.signal });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        const retry = Number(res.headers.get("retry-after")) || 2 ** attempt;
        await sleep(Math.min(retry, 30) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${pathname}`);
      return await res.json();
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(500 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// ---- selección de tráiler ---------------------------------------------------
const LANG_PRIORITY = (() => {
  const base = LANG.split("-")[0];
  return [LANG, `${base}-ES`, `${base}-MX`, `${base}-419`, base, "en"];
})();

function pickTrailer(data) {
  const videos = (data && data.videos && Array.isArray(data.videos.results)) ? data.videos.results : [];
  const usable = videos.filter(
    (v) => v && v.site === "YouTube" && v.key && ["Trailer", "Teaser"].includes(v.type)
  );
  if (!usable.length) return null;
  const score = (v) => {
    let s = 0;
    const idx = LANG_PRIORITY.indexOf(v.iso_639_1);
    if (idx !== -1) s += (LANG_PRIORITY.length - idx) * 10; // idiomas preferidos primero
    if (v.type === "Trailer") s += 6;
    if (v.official) s += 4;
    if (/official trailer/i.test(v.name || "")) s += 2;
    return s;
  };
  const best = usable.sort((a, b) => score(b) - score(a))[0];
  return { key: best.key, name: best.name || null, lang: best.iso_639_1 || null };
}

// ---- selección de plataformas ----------------------------------------------
const PROVIDER_TYPES = ["flatrate", "free", "ads", "rent", "buy"];

function pickProviders(data, region = REGION) {
  const wp = data && data["watch/providers"];
  const country = wp && wp.results ? wp.results[region] : null;
  if (!country) return { providers: [], link: null };
  const out = [];
  const seen = new Set();
  for (const type of PROVIDER_TYPES) {
    for (const p of country[type] || []) {
      if (!p || !p.provider_id || seen.has(p.provider_id)) continue;
      seen.add(p.provider_id);
      out.push({
        id: String(p.provider_id),
        name: p.provider_name || String(p.provider_id),
        type,
        logo: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
      });
    }
  }
  return { providers: out.slice(0, 8), link: country.link || null };
}

// ---- main -------------------------------------------------------------------
const catalogPath = resolveCatalogPath();
if (!existsSync(catalogPath)) {
  console.error(`[tmdb] no existe ${catalogPath}`);
  process.exit(1);
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const targets = [...(catalog.movies || []), ...(catalog.series || [])].filter((item) => {
  const id = String(item.tmdb || "").trim();
  if (!/^\d+$/.test(id)) return false;
  if (ONLY_MISSING && item.trailerKey) return false;
  return true;
});

const selected = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;
console.log(`[tmdb] ${selected.length} títulos a enriquecer (región ${REGION}, idioma ${LANG})`);

let updated = 0;
let trailers = 0;
let withProviders = 0;
let failed = 0;
let done = 0;

async function worker(item) {
  const media = item.type === "series" ? "tv" : "movie";
  try {
    const data = await tmdb(`/${media}/${encodeURIComponent(String(item.tmdb))}`, {
      language: LANG,
      append_to_response: "videos,watch/providers",
    });
    if (data) {
      const trailer = pickTrailer(data);
      if (trailer) {
        item.trailerKey = trailer.key;
        item.trailerName = trailer.name;
        item.trailerLang = trailer.lang;
        trailers++;
      }
      const { providers, link } = pickProviders(data, REGION);
      if (providers.length) {
        item.providers = providers;
        item.providersRegion = REGION;
        if (link) item.providerLink = link;
        withProviders++;
      }
      updated++;
    }
  } catch (e) {
    failed++;
    if (failed <= 5) console.warn(`[tmdb] ${media}/${item.tmdb}: ${e.message}`);
  } finally {
    done++;
    if (done % 200 === 0 || done === selected.length) {
      console.log(`[tmdb]   ${done}/${selected.length} (tráilers ${trailers}, plataformas ${withProviders})`);
    }
  }
}

const queue = selected.slice();
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  })
);

if (DRY_RUN) {
  console.log(`[tmdb] dry-run: ${updated} actualizados, ${trailers} tráilers, ${withProviders} con plataformas`);
  process.exit(0);
}

catalog.meta = catalog.meta || {};
catalog.meta.tmdb = {
  enrichedAt: new Date().toISOString(),
  region: REGION,
  language: LANG,
  trailers,
  withProviders,
};
writeFileSync(catalogPath, JSON.stringify(catalog));
console.log(
  `[tmdb] escrito ${catalogPath}: ${updated} actualizados, ${trailers} tráilers, ` +
    `${withProviders} con plataformas, ${failed} fallos`
);
