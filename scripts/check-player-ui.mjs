// Comprobación de la capa de fuentes del reproductor, sin navegador real.
// Sirve `index.html` + `detalle/` con un servidor local y ejecuta la app en
// jsdom: abre una ficha de película, pulsa "Reproducir" y valida el panel.
//
// Requiere la dependencia de desarrollo: npm install
// Uso: node scripts/check-player-ui.mjs
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 4311);
const BASE = `http://127.0.0.1:${PORT}`;

let jsdomPkg;
try {
  jsdomPkg = (await import("jsdom")).default;
} catch {
  console.log("jsdom no está instalado; ejecuta `npm install` para correr este test.");
  process.exit(0);
}
const { JSDOM, VirtualConsole, requestInterceptor } = jsdomPkg;

// charset explícito: jsdom, a diferencia del navegador, no adivina UTF-8
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(ROOT, p);
    const s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const resources = {
  interceptors: [
    requestInterceptor((request) => {
      if (new URL(request.url).hostname === "127.0.0.1") return undefined;
      return new Response("", { status: 204, headers: { "content-type": "text/plain" } });
    }),
  ],
};

const failures = [];
const check = (label, cond, extra = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}${!cond && extra ? ` — ${extra}` : ""}`);
  if (!cond) failures.push(label);
};

const waitFor = async (dom, selector, timeout = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const node = dom.window.document.querySelector(selector);
    if (node) return node;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
};

const open = async (path) => {
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => {
    if (!/Could not load|resource|XMLHttpRequest|css/i.test(String(e.message))) {
      console.error("  [jsdom]", e.message);
    }
  });
  return JSDOM.fromURL(BASE + path, {
    runScripts: "dangerously",
    resources,
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      // fetch resuelve contra <base href="/">, igual que un navegador real
      window.fetch = (input, init) => globalThis.fetch(new URL(input, window.document.baseURI || window.location.href), init);
      window.scrollTo = () => {};
      window.Element.prototype.scrollIntoView = () => {};
    },
  });
};

const click = (dom, node) => node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));

const catalog = JSON.parse(await readFile(join(ROOT, "data/catalog.json"), "utf8"));

// ---------- ficha de película ----------
const movieItem = catalog.movies.find((m) => m.slug === "007-al-servicio-secreto-de-su-majestad");
{
  const dom = await open("/detalle/movie/007-al-servicio-secreto-de-su-majestad/");
  await waitFor(dom, ".play-btn");
  const doc = dom.window.document;
  const btn = doc.querySelector(".play-btn");
  check("película: botón Reproducir renderizado", Boolean(btn));
  check("película: el botón lleva contexto", btn?.getAttribute("data-tmdb") && btn?.getAttribute("data-imdb"), btn?.outerHTML);
  click(dom, btn);
  check("película: panel de fuentes abierto", Boolean(await waitFor(dom, ".pp")));
  const links = [...doc.querySelectorAll(".pp-links a")].map((a) => a.getAttribute("href"));
  check("película: enlace de tráiler", links.some((h) => h.startsWith("https://www.youtube.com/results?search_query=")), links.join(" | "));
  check("película: ficha TMDB", links.includes(`https://www.themoviedb.org/movie/${movieItem.tmdb}`), links.join(" | "));
  check("película: ficha IMDb", links.includes(`https://www.imdb.com/title/${movieItem.externalId}/`), links.join(" | "));
  check("película: JustWatch", links.some((h) => h.startsWith("https://www.justwatch.com/")));
  check("película: plataformas oficiales", doc.querySelectorAll(".pp-provider").length === 7, String(doc.querySelectorAll(".pp-provider").length));
  check("película: sin iframe (config legal por defecto)", !doc.querySelector(".pp-frame iframe"));
  check("película: aviso legal", /no aloja ni transmite/i.test(doc.querySelector(".pp-note")?.textContent || ""));
  click(dom, doc.querySelector(".pp-close"));
  check("película: el panel se cierra", !doc.querySelector(".pp"));

  // título enriquecido por scripts/enrich-tmdb.mjs: tráiler incrustado + plataformas
  dom.window.eval(`
    (() => {
      const item = CATALOG.movies.find((m) => m.slug === "007-al-servicio-secreto-de-su-majestad");
      item.trailerKey = "dQw4w9WgXcQ";
      item.providersRegion = "PE";
      item.providerLink = "https://www.themoviedb.org/movie/668/watch?locale=PE";
      item.providers = [
        { id: "8", name: "Netflix", type: "flatrate", logo: null },
        { id: "2", name: "Apple TV", type: "rent", logo: null },
      ];
    })()
  `);
  click(dom, btn);
  await waitFor(dom, ".pp");
  const frame = doc.querySelector(".pp-frame iframe");
  check("enriquecido: tráiler en iframe", frame?.getAttribute("src")?.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"), frame?.getAttribute("src"));
  check("enriquecido: un solo embed, sin pestañas", !doc.querySelector(".pp-tabs"));
  const realProviders = [...doc.querySelectorAll(".pp-provider-real")];
  check("enriquecido: plataformas oficiales", realProviders.length === 2, String(realProviders.length));
  check("enriquecido: enlace de disponibilidad", realProviders[0]?.getAttribute("href") === "https://www.themoviedb.org/movie/668/watch?locale=PE", realProviders[0]?.getAttribute("href"));
  check("enriquecido: tipo de plataforma", /Suscripción/.test(realProviders[0]?.textContent || ""), realProviders[0]?.textContent);
  dom.window.close();
}

// ---------- serie + deep link de episodio ----------
const show = catalog.series.find((s) => /^[a-z0-9-]+$/.test(s.slug) && (s.episodes || []).length > 0);
{
  const ep0 = show.episodes[0];
  const dom = await open(`/detalle/series/${show.slug}/#t${ep0.season}e${ep0.episode}`);
  await waitFor(dom, ".seasons-block");
  const doc = dom.window.document;
  check("serie: ficha con temporadas", Boolean(doc.querySelector(".seasons-block")));
  check("serie: panel abierto desde #tSeE", Boolean(await waitFor(dom, ".pp")), show.slug);
  check(
    "serie: episodio correcto en el panel",
    new RegExp(`T${ep0.season} E${ep0.episode}`).test(doc.querySelector(".pp-title h3")?.textContent || ""),
    doc.querySelector(".pp-title h3")?.textContent
  );
  check(
    "serie: ficha TMDB de serie",
    [...doc.querySelectorAll(".pp-links a")].some((a) => a.getAttribute("href") === `https://www.themoviedb.org/tv/${show.tmdb}`)
  );

  // clic en una fila de episodio -> panel con ese episodio
  const rows = [...doc.querySelectorAll(".episodes-list a[data-player]")];
  check("serie: filas de episodio con contexto", rows.length > 0 && rows[0].getAttribute("data-season") !== null);
  click(dom, rows[0]);
  await new Promise((r) => setTimeout(r, 300));
  check(
    "serie: clic en episodio abre su panel",
    new RegExp(`T${rows[0].dataset.season} E${rows[0].dataset.episode}`).test(doc.querySelector(".pp-title h3")?.textContent || ""),
    doc.querySelector(".pp-title h3")?.textContent
  );
  dom.window.close();
}

// ---------- home: tarjetas de episodio ----------
{
  const dom = await open("/");
  await waitFor(dom, ".episode-card");
  const card = dom.window.document.querySelector(".episode-card");
  check("home: episodios enlazan a la ficha", Boolean(card?.getAttribute("href")?.includes("/detalle/series/")), card?.outerHTML?.slice(0, 160));
  check("home: sin URLs de vídeo en el DOM", !dom.window.document.body.innerHTML.includes(["play", "paste"].join("")));
  dom.window.close();
}

server.close();
console.log(failures.length ? `\n${failures.length} fallo(s)` : "\nUI: todas las comprobaciones pasaron");
process.exit(failures.length ? 1 : 0);
