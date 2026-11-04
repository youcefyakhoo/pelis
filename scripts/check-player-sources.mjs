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
// embeds de la config por defecto, y ninguno es la página de cuevana3c.pro
// (esa va aparte, en result.cuevana, porque hay que sacarle los servidores).
check(
  "película: los únicos embeds son los de respaldo",
  movie.embeds.every((e) => e.id === "vidsrc-es" || e.id === "embed69"),
  movie.embeds.map((e) => e.id).join(",")
);
check("película: dos reproductores directos en película", movie.embeds.length === 2, `salieron ${movie.embeds.length}`);
// El orden declara cuál va primero: ev.pelislatinohd.com delante, cuevana detrás.
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

// ---- 5b. extractor de servidores de Cuevana (js/cuevana.js) ---------------
// El motor de js/app.js se evalúa en un vm; js/cuevana.js se carga igual para
// probar el parseo contra una página real guardada en tests/fixtures.
let cuevana = null;
try {
  const cuevanaSrc = read("js/cuevana.js");
  const cuevanaCtx = vm.createContext({
    console,
    window: {},
    TextEncoder,
    TextDecoder,
    atob,
    URL,
  });
  vm.runInContext(cuevanaSrc, cuevanaCtx);
  cuevana = cuevanaCtx.window.Cuevana;
} catch (e) {
  console.error(`  FAIL no se pudo cargar js/cuevana.js — ${e.message}`);
  failures++;
}

if (cuevana) {
  check("Cuevana exportado por js/cuevana.js", typeof cuevana === "object" && cuevana !== null);
  check("Cuevana.extraerServidores es función", typeof cuevana.extraerServidores === "function");

  // URLs de página
  check(
    "cuevana: URL de película",
    cuevana.urlPagina({ slug: "spider-man-un-nuevo-dia" }) === "https://cuevana3c.pro/pelicula/spider-man-un-nuevo-dia",
    cuevana.urlPagina({ slug: "spider-man-un-nuevo-dia" })
  );
  check(
    "cuevana: URL de episodio",
    cuevana.urlPagina({ slug: "akka", tipo: "series", temporada: 1, episodio: 1 }) === "https://cuevana3c.pro/serie/akka/episodio-1x1",
    cuevana.urlPagina({ slug: "akka", tipo: "series", temporada: 1, episodio: 1 })
  );
  check("cuevana: sin slug no inventa URL", cuevana.urlPagina({}) === null);

  // Prioridad de idioma
  check("cuevana: prioridad Latino", cuevana.prioridadIdioma("Latino") === 0);
  check("cuevana: prioridad Castellano", cuevana.prioridadIdioma("Castellano") === 1);
  check("cuevana: prioridad Subtitulado", cuevana.prioridadIdioma("Subtitulado") === 2);
  check("cuevana: prioridad resto", cuevana.prioridadIdioma("Multilenguaje [CC]") === 3);
  check("cuevana: prioridad sin idioma", cuevana.prioridadIdioma(null) === 3);

  // Descifrado del wrapper (comprobado a mano contra el JavaScript del wrapper)
  const tokens = [
    ["1D1ZdAEgBWlxOV0oK", "https://ikhjerbhye3wjkhoduh5xiczuvd.lol/v/nbhfx599cey3"],
    ["3BwJDCllQGx0UAF5L", "https://lkhjerbhye3wjkhodvh5xlczuvd.lol/e/f6vlidxx92mr"],
    ["1VVsMBQVbAB9MSEAJ", "https://ikhjerbhye3wjkhoduh5xiczuvd.lol/v/4o9c5oczazs0"],
    ["3AEdPV0NcVlAbQ1pR", "https://lkhjerbhye3wjkhodvh5xlczuvd.lol/e/asz1sh556qih"],
    ["1FVNZBVZHVA8dVwBf", "https://ikhjerbhye3wjkhoduh5xiczuvd.lol/v/tglcfs7j0e3f"],
    ["3BFUAEkdDCxdcU0NY", "https://lkhjerbhye3wjkhodvh5xlczuvd.lol/e/ea5twwhrqapa"],
  ];
  for (const [tok, esperado] of tokens) {
    check(`cuevana: token ${tok}`, cuevana.descifrarWrapper(`${cuevana.WRAPPER}?token=${tok}`) === esperado);
  }
  check(
    "cuevana: ?v= da la URL del embed",
    cuevana.descifrarWrapper(`${cuevana.WRAPPER}?v=aHR0cHM6Ly92aWRsaW5rLnByby9tb3ZpZS85Njk2ODE`) === "https://vidlink.pro/movie/969681"
  );
  check("cuevana: lo que no es wrapper da null", cuevana.descifrarWrapper("https://ejemplo.com/x") === null);

  // Parseo contra la página real
  const peli = read("tests/fixtures/cuevana-pelicula.html");
  const epi = read("tests/fixtures/cuevana-episodio.html");

  const gp = cuevana.agruparPorIdioma(cuevana.extraerServidores(peli));
  const totalPeli = gp.reduce((n, g) => n + g.servidores.length, 0);
  console.log(`  ..   película: ${totalPeli} servidores en ${gp.length} idiomas (${gp.map((g) => g.idioma).join(" / ")})`);
  check("cuevana: película con 4 grupos de idioma", gp.length === 4, `salieron ${gp.length}`);
  check("cuevana: película con 10 servidores", totalPeli === 10, `salieron ${totalPeli}`);
  check(
    "cuevana: orden Latino, Castellano, Subtitulado y resto",
    JSON.stringify(gp.map((g) => g.idioma)) === JSON.stringify(["Latino", "Castellano", "Subtitulado", "Multilenguaje [CC]"]),
    JSON.stringify(gp.map((g) => g.idioma))
  );
  check(
    "cuevana: ningún servidor se llama 'Reproducir'",
    gp.every((g) => g.servidores.every((s) => s.nombre && s.nombre !== "Reproducir")),
    JSON.stringify(gp.map((g) => g.servidores.map((s) => s.nombre)))
  );
  check(
    "cuevana: todas las URLs son http(s)",
    gp.every((g) => g.servidores.every((s) => /^https?:\//.test(s.url)))
  );

  const ge = cuevana.agruparPorIdioma(cuevana.extraerServidores(epi));
  const totalEpi = ge.reduce((n, g) => n + g.servidores.length, 0);
  console.log(`  ..   episodio: ${totalEpi} servidores en ${ge.length} idiomas (${ge.map((g) => g.idioma).join(" / ")})`);
  check("cuevana: episodio con 6 servidores", totalEpi === 6, `salieron ${totalEpi}`);
  check("cuevana: Latino primero también en el episodio", ge[0] && ge[0].idioma === "Latino", ge[0] && ge[0].idioma);

  // Robustez: nunca debe lanzar con HTML raro
  check("cuevana: HTML vacío no rompe", cuevana.extraerServidores("").length === 0);
  check("cuevana: HTML sin pestañas no rompe", cuevana.extraerServidores("<html><body>nada</body></html>").length === 0);
  check("cuevana: agrupar lista vacía", cuevana.agruparPorIdioma([]).length === 0);
}

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

// ---- 5c. la fuente de Cuevana se resuelve a su página ----------------------
const cvPeli = resolvePlayerSources(config, {
  type: "movie", title: "Spider-Man: Un nuevo día", year: 2026, tmdb: "969681", slug: "spider-man-un-nuevo-dia",
});
check(
  "cuevana: la fuente apunta a la página de cuevana3c.pro",
  cvPeli.cuevana?.url === "https://cuevana3c.pro/pelicula/spider-man-un-nuevo-dia",
  cvPeli.cuevana?.url
);
check("cuevana: no se embebe la página como si fuera vídeo", cvPeli.embeds.every((e) => !e.url.includes("cuevana3c.pro")));
const cvEpi = resolvePlayerSources(config, {
  type: "series", title: "Akka", tmdb: "243555", slug: "akka", season: "1", episode: "1",
});
check(
  "cuevana: el episodio usa su propia URL",
  cvEpi.cuevana?.url === "https://cuevana3c.pro/serie/akka/episodio-1x1",
  cvEpi.cuevana?.url
);

// ---- 5d. toda página que cargue app.js carga antes cuevana.js -------------
// js/app.js depende del global `Cuevana`. Si una página se queda sin el
// <script> de js/cuevana.js, el botón Reproducir de esa página no funciona.
// Este check lo pilla antes de llegar a producción.
const htmlSinCuevana = [];
const htmlMalOrden = [];
{
  const walkHtml = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === ".git" || name === "node_modules") continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walkHtml(full);
      else if (extname(name) === ".html") {
        const text = readFileSync(full, "utf8");
        if (!text.includes("js/app.js")) continue;
        const a = text.indexOf("js/cuevana.js");
        const b = text.indexOf("js/app.js");
        if (a === -1) htmlSinCuevana.push(full.slice(ROOT.length));
        else if (a > b) htmlMalOrden.push(full.slice(ROOT.length));
      }
    }
  };
  walkHtml(ROOT);
}
check("toda página con app.js carga también cuevana.js", htmlSinCuevana.length === 0, htmlSinCuevana.slice(0, 5).join(", "));
check("cuevana.js se carga antes que app.js", htmlMalOrden.length === 0, htmlMalOrden.slice(0, 5).join(", "));

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
