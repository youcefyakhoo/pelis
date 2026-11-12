// Valida la capa de fuentes del reproductor (data/servers.json) sin navegador.
// Extrae las funciones puras de js/app.js entre los marcadores
// [player-sources:start] / [player-sources:end] y comprueba la resolución.
//
// Uso: node scripts/check-player-sources.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

let failures = 0;
const check = (label, cond, extra = "") => {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${extra ? ` — ${extra}` : ""}`);
  }
};

// ---- 1. engine from js/app.js ------------------------------------------------
const app = read("js/app.js");
const start = app.indexOf("// [player-sources:start]");
const end = app.indexOf("// [player-sources:end]");
check("marcadores del motor presentes en js/app.js", start !== -1 && end > start);
if (start === -1 || end === -1) process.exit(1);

const engineSource = app.slice(start, end);
const context = vm.createContext({ console });
vm.runInContext(`${engineSource}\nthis.resolvePlayerSources = resolvePlayerSources;`, context);
const resolvePlayerSources = context.resolvePlayerSources;
check("resolvePlayerSources exportado por el bloque", typeof resolvePlayerSources === "function");

// ---- 2. config -------------------------------------------------------------
const config = JSON.parse(read("data/servers.json"));
check("data/servers.json con sources[]", Array.isArray(config.sources) && config.sources.length > 0);
check("data/servers.json con providers[]", Array.isArray(config.providers) && config.providers.length > 0);
for (const src of config.sources) {
  check(`fuente "${src.id}" tiene id/name/url`, Boolean(src.id && src.name && (src.url || src.episodeUrl)));
}
for (const p of config.providers) {
  check(`proveedor "${p.id}" tiene url`, Boolean(p.id && p.name && p.url));
}

// ---- 3. resolución de una película ----------------------------------------
const movie = resolvePlayerSources(config, {
  type: "movie",
  title: "El padrino",
  year: 1972,
  tmdb: "238",
  imdb: "tt0068646",
  slug: "el-padrino",
});
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

// Los reproductores de ev.pelislatinohd.com SÍ se embeben: son los únicos
// embeds de la config por defecto.
check(
  "película: los únicos embeds son los de respaldo",
  movie.embeds.every((e) => e.id === "vidsrc-es" || e.id === "embed69"),
  movie.embeds.map((e) => e.id).join(",")
);
check("película: dos reproductores directos en película", movie.embeds.length === 2, `salieron ${movie.embeds.length}`);
// El orden declara cuál va primero.
check(
  "película: ev va primero en el orden",
  movie.embeds[0]?.id === "vidsrc-es" && movie.embeds[1]?.id === "embed69",
  movie.embeds.map((e) => e.id).join(",")
);
check("película: enlace de tráiler", byId(movie.links).trailer?.url.startsWith("https://www.youtube.com/results?search_query="));
check(
  "película: query codificada",
  decodeURIComponent(byId(movie.links).trailer.url.replace(/\+/g, " ")).includes("El padrino"),
  byId(movie.links).trailer?.url
);
check("película: ficha TMDB de película", byId(movie.links).tmdb?.url === "https://www.themoviedb.org/movie/238");
check("película: ficha IMDb", byId(movie.links).imdb?.url === "https://www.imdb.com/title/tt0068646/");
check("película: JustWatch", byId(movie.links).justwatch?.url.startsWith("https://www.justwatch.com/"));
check("película: proveedores oficiales", movie.providers.length === config.providers.length);
check("película: sin fuente deshabilitada", !movie.embeds.some((e) => e.id === "propio"));

// ---- 3b. tráiler oficial incrustado ---------------------------------------
const trailerSrc = (config.sources || []).find((x) => x.id === "trailer-embed");
check("config: fuente de tráiler embed", trailerSrc?.kind === "embed" && trailerSrc.url.includes("{trailerKey}"));

const withTrailer = resolvePlayerSources(config, {
  type: "movie",
  title: "El padrino",
  year: 1972,
  tmdb: "238",
  imdb: "tt0068646",
  trailerKey: "dQw4w9WgXcQ",
});
// El tráiler se busca por id: los reproductores de ev.pelislatinohd.com van
// delante y ya no es el primero de la lista.
const trailerDe = (r) => Object.fromEntries(r.embeds.map((x) => [x.id, x]))["trailer-embed"];
check("tráiler: iframe de youtube-nocookie", trailerDe(withTrailer)?.url.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), trailerDe(withTrailer)?.url);
check("tráiler: sin clave no se incrusta nada", !trailerDe(movie));

const trailerEp = resolvePlayerSources(config, {
  type: "series", title: "Siren", tmdb: "71886", trailerKey: "abc123", season: "1", episode: "2",
});
check("tráiler: disponible también en episodios", trailerDe(trailerEp)?.url.includes("abc123"));

// ---- 4. serie y episodio ---------------------------------------------------
const series = resolvePlayerSources(config, {
  type: "series",
  title: "Breaking Bad",
  year: 2008,
  tmdb: "1396",
  imdb: "tt0903747",
  slug: "breaking-bad",
});
check("serie: ficha TMDB de serie", byId(series.links).tmdb?.url === "https://www.themoviedb.org/tv/1396");

const episode = resolvePlayerSources(config, {
  type: "series",
  title: "Breaking Bad",
  year: 2008,
  tmdb: "1396",
  imdb: "tt0903747",
  slug: "breaking-bad",
  season: "1",
  episode: "5",
});
check("episodio: tráiler sigue disponible", Boolean(byId(episode.links).trailer));
check("episodio: IMDb de la serie", byId(episode.links).imdb?.url === "https://www.imdb.com/title/tt0903747/");

// sin tmdb/imdb no se generan enlaces roto-vacíos
const bare = resolvePlayerSources(config, { type: "movie", title: "Sin ids" });
check("sin ids: no inventa ficha TMDB", !byId(bare.links).tmdb);
check("sin ids: no inventa ficha IMDb", !byId(bare.links).imdb);
check("sin ids: conserva tráiler", Boolean(byId(bare.links).trailer));

// ---- 5. embed propio (licenciado) -----------------------------------------
const ownConfig = {
  sources: [
    {
      id: "propio",
      name: "Mi catálogo",
      kind: "embed",
      appliesTo: ["movie", "series"],
      url: "https://stream.example.com/embed/{media}/{tmdb}",
      episodeUrl: "https://stream.example.com/embed/{media}/{tmdb}?t={season}&e={episode}",
      order: 1,
    },
  ],
  providers: [],
};
const ownMovie = resolvePlayerSources(ownConfig, { type: "movie", title: "X", tmdb: "42" });
check("embed propio: película", ownMovie.embeds[0]?.url === "https://stream.example.com/embed/movie/42");
const ownEp = resolvePlayerSources(ownConfig, { type: "series", title: "Y", tmdb: "7", season: "2", episode: "3" });
check(
  "embed propio: episodio usa episodeUrl",
  ownEp.embeds[0]?.url === "https://stream.example.com/embed/tv/7?t=2&e=3",
  ownEp.embeds[0]?.url
);
const missing = resolvePlayerSources(
  { sources: [{ id: "x", name: "x", kind: "embed", url: "https://a.example/{tmdb}/{season}" }] },
  { type: "movie", title: "Z" }
);
check("embed con marcador sin valor se descarta", missing.embeds.length === 0);

// ---- 5b. el respaldo de ev.pelislatinohd.com ---------------------------------
// Comprobado en vivo: vidsrc.sh responde 200 en película y en episodio;
// embed69 solo en película (con series da {"error":"No folders found"}).
const rVidsrc = (config.sources || []).find((x) => x.id === "vidsrc-es");
check("respaldo: vidsrc existe y está activo", rVidsrc?.enabled === true && rVidsrc?.kind === "embed");
check(
  "respaldo: vidsrc de película por IMDb y en español",
  rVidsrc?.url === "https://vidsrc.sh/embed/movie?imdb={imdb}&ds_lang=es",
  rVidsrc?.url
);
check(
  "respaldo: vidsrc de episodio por TMDB",
  rVidsrc?.episodeUrl === "https://vidsrc.sh/embed/tv?tmdb={tmdb}&season={season}&episode={episode}&ds_lang=es",
  rVidsrc?.episodeUrl
);
const rEmb69 = (config.sources || []).find((x) => x.id === "embed69");
check(
  "respaldo: embed69 solo en película",
  Array.isArray(rEmb69?.appliesTo) && rEmb69.appliesTo.length === 1 && rEmb69.appliesTo[0] === "movie",
  JSON.stringify(rEmb69?.appliesTo)
);
check("respaldo: embed69 por IMDb", rEmb69?.url === "https://embed69.org/f/{imdb}/", rEmb69?.url);

// El respaldo se resuelve con los ids del catálogo: película por IMDb.
const fbMovie = resolvePlayerSources(config, {
  type: "movie", title: "Red Social", year: 2010, tmdb: "37799", imdb: "tt1285016", slug: "red-social",
});
const fbById = Object.fromEntries(fbMovie.embeds.map((x) => [x.id, x]));
check(
  "respaldo: URL de película de vidsrc",
  fbById["vidsrc-es"]?.url === "https://vidsrc.sh/embed/movie?imdb=tt1285016&ds_lang=es",
  fbById["vidsrc-es"]?.url
);
check(
  "respaldo: URL de película de embed69",
  fbById.embed69?.url === "https://embed69.org/f/tt1285016/",
  fbById.embed69?.url
);

// …y el episodio por TMDB (en el catálogo las series llevan TMDB, no IMDb).
const fbEp = resolvePlayerSources(config, {
  type: "series", title: "Siren", tmdb: "71886", slug: "siren", season: "1", episode: "1",
});
const fbEpById = Object.fromEntries(fbEp.embeds.map((x) => [x.id, x]));
check(
  "respaldo: URL de episodio de vidsrc",
  fbEpById["vidsrc-es"]?.url === "https://vidsrc.sh/embed/tv?tmdb=71886&season=1&episode=1&ds_lang=es",
  fbEpById["vidsrc-es"]?.url
);
check(
  "respaldo: embed69 no se ofrece en episodio (no funciona con series)",
  !fbEpById.embed69,
  JSON.stringify(fbEp.embeds.map((x) => x.id))
);
// Sin ids no se puede construir nada: mejor descartar que inventar una URL.
const fbNoIds = resolvePlayerSources(config, { type: "movie", title: "Sin ids" });
check("respaldo: sin ids no se inventa ninguna URL", fbNoIds.embeds.length === 0, `salieron ${fbNoIds.embeds.length}`);

// ---- 6. ningún host de vídeo incrustado en el repo ------------------------
const BANNED = ["play" + "paste", "pelis" + "flix"];
const offenders = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue;
    if (name.startsWith("check-player-")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if ([".js", ".mjs", ".json", ".html", ".css", ".md"].includes(extname(name))) {
      const text = readFileSync(full, "utf8").toLowerCase();
      for (const bad of BANNED) if (text.includes(bad)) offenders.push(`${full} (${bad})`);
    }
  }
};
walk(ROOT);
check("sin hosts de streaming pirata en js/scraper/data", offenders.length === 0, offenders.slice(0, 5).join(", "));

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : "\nTodas las comprobaciones pasaron");
process.exit(failures ? 1 : 0);
