// Comprobación del selector de servidores de Cuevana, sin navegador real.
// Sirve el repo con un servidor local y ejecuta la app en jsdom: abre una
// ficha de película, pulsa "Reproducir" y valida que salgan las pestañas de
// idioma y los servidores. La página de cuevana3c.pro se sirve desde
// tests/fixtures para no depender de la red.
//
// Requiere la dependencia de desarrollo: npm install
// Uso: node scripts/check-player-ui.mjs
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 4311);
// PREFIX=/pelis simula el project site de GitHub Pages (sitio bajo subruta).
const PREFIX = `/${String(process.env.PREFIX || "").replace(/^\/+|\/+$/g, "")}`.replace(/^\/$/, "");
const BASE = `http://127.0.0.1:${PORT}${PREFIX}`;

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
  const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (PREFIX && !pathname.startsWith(`${PREFIX}/`) && pathname !== PREFIX) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("fuera del prefijo");
    return;
  }
  const rel = PREFIX ? pathname.slice(PREFIX.length) || "/" : pathname;
  try {
    let file = join(ROOT, rel);
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

// Páginas reales de cuevana3c.pro guardadas como fixture: el selector debe
// comportarse igual con ellas que con el sitio en vivo.
const FIXTURAS = {
  "https://cuevana3c.pro/pelicula/": "tests/fixtures/cuevana-pelicula.html",
  "https://cuevana3c.pro/serie/": "tests/fixtures/cuevana-episodio.html",
};
const fixtureDe = async (url) => {
  const u = String(url);
  for (const [prefijo, fichero] of Object.entries(FIXTURAS)) {
    if (u.startsWith(prefijo)) return await readFile(join(ROOT, fichero), "utf8");
  }
  return null;
};

const resources = {
  interceptors: [
    requestInterceptor((request) => {
      const url = new URL(request.url);
      if (url.hostname !== "127.0.0.1") return new Response("", { status: 204, headers: { "content-type": "text/plain" } });
      if (PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return new Response("", { status: 404 });
      return undefined;
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

const open = async (path, opts = {}) => {
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
      // Igual que un navegador: fetch resuelve contra <base href>. Las peticiones
      // a cuevana3c.pro se sirven desde el fixture.
      const realFetch = globalThis.fetch;
      window.fetch = async (input, init) => {
        const abs = new URL(String(input), window.document.baseURI || window.location.href);
        // Se cuenta la petición a cuevana3c.pro ESTÉ o no caída: así se puede
        // afirmar que sacar los reproductores directos no ha costado ninguna.
        if (new URL(abs).hostname === "cuevana3c.pro" && opts.contar) opts.contar.n++;
        // cuevanaCaído: la página de cuevana3c.pro falla, como cuando el sitio
        // está caído de verdad. Tiene que saltar el respaldo.
        if (opts.cuevanaCaido && new URL(abs).hostname === "cuevana3c.pro") {
          throw new TypeError("Failed to fetch");
        }
        const html = await fixtureDe(abs.href);
        if (html != null) return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
        return realFetch(abs, init);
      };
      window.scrollTo = () => {};
      window.Element.prototype.scrollIntoView = () => {};
    },
  });
};

const click = (dom, node) => node && node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
const textos = (dom, sel) => [...dom.window.document.querySelectorAll(sel)].map((n) => n.textContent.trim());

const catalog = JSON.parse(await readFile(join(ROOT, "data/catalog.json"), "utf8"));

// ---------- ficha de película ----------
const movieItem = catalog.movies.find((m) => m.slug === "007-al-servicio-secreto-de-su-majestad");
{
  const contar = { n: 0 };
  const dom = await open("/detalle/movie/007-al-servicio-secreto-de-su-majestad/", { contar });
  await waitFor(dom, ".play-btn");
  const doc = dom.window.document;
  const btn = doc.querySelector(".play-btn");
  check("película: botón Reproducir renderizado", Boolean(btn));
  check("película: el botón lleva el slug", btn?.getAttribute("data-cv-slug") === movieItem.slug, btn?.outerHTML);
  check("película: el botón dice que es película", btn?.getAttribute("data-cv-tipo") === "movie");
  check("película: no lleva URL de vídeo en el DOM", !/tungtungsahur|vidapi/.test(btn?.outerHTML || ""));

  click(dom, btn);
  const tabs = await waitFor(dom, ".cv-tab");
  check("película: selector de servidores abierto", Boolean(tabs));

  // ev.pelislatinohd.com va PRIMERO: sus embeds se pintan solos.
  const idiomas = textos(dom, ".cv-tab");
  console.log(`  ..   pestañas: ${idiomas.join(" / ")}`);
  check(
    "película: ev primero y cuevana como respaldo",
    JSON.stringify(idiomas) === JSON.stringify(["Español", "Cuevana"]),
    JSON.stringify(idiomas)
  );
  check("película: Español está activo", doc.querySelector(".cv-tab.activo")?.textContent.trim() === "Español");
  const directos = textos(dom, ".cv-srv");
  console.log(`  ..   reproductores directos: ${directos.join(", ")}`);
  check(
    "película: los dos embeds de ev.pelislatinohd.com",
    directos.length === 2 && directos.some((t) => t.includes("VidSrc")) && directos.some((t) => t.includes("Embed69")),
    JSON.stringify(directos)
  );
  // Lo importante: pintar esto NO ha costado ninguna petición a cuevana3c.pro.
  check("película: sin ninguna petición a cuevana3c.pro", contar.n === 0, `${contar.n} peticiones`);

  // cuevana es PEREZOSO: su pestaña no baja nada hasta que se pulsa.
  const tabCv = [...doc.querySelectorAll(".cv-tab")].find((t) => t.textContent.trim() === "Cuevana");
  click(dom, tabCv);
  await new Promise((r) => setTimeout(r, 400));
  check("película: la pestaña Cuevana no baja nada por sí sola", contar.n === 0, `${contar.n} peticiones`);
  check(
    "película: la pestaña Cuevana ofrece cargar",
    Boolean(doc.querySelector(".cv-cargar[data-cv-cargar]")),
    doc.querySelector(".cv-servidores")?.textContent?.slice(0, 120)
  );

  // al pulsar «cargar» sí baja cuevana, con sus 4 idiomas
  click(dom, doc.querySelector(".cv-cargar[data-cv-cargar]"));
  const tabLat = await waitFor(dom, ".cv-tab", 15000);
  const idiomasCv = textos(dom, ".cv-tab");
  console.log(`  ..   idiomas de cuevana: ${idiomasCv.join(" / ")}`);
  check("película: cuevana baja sus idiomas al pedirlos", Boolean(tabLat));
  check(
    "película: idiomas de cuevana completos",
    JSON.stringify(idiomasCv) === JSON.stringify(["Latino", "Castellano", "Subtitulado", "Multilenguaje [CC]"]),
    JSON.stringify(idiomasCv)
  );
  check("película: cuevana sí se pidió al cargarla", contar.n > 0, `${contar.n} peticiones`);

  // y un servidor de cuevana abre el iframe del wrapper
  const srvCv = [...doc.querySelectorAll(".cv-srv")].find((n) => (n.getAttribute("data-cv-url") || "").includes("cuevana3c.pro"));
  click(dom, srvCv);
  const frameCv = await waitFor(dom, ".player-wrap iframe");
  check(
    "película: el iframe de cuevana apunta al wrapper",
    (frameCv?.getAttribute("src") || "").startsWith("https://tungtungsahur.cuevana3c.pro/?token="),
    frameCv?.getAttribute("src")
  );

  // Se vuelve a abrir el selector y se pulsa un reproductor directo: tiene que
  // salir su embed, no el de cuevana.
  click(dom, doc.querySelector(".play-btn"));
  const tabEs2 = await waitFor(dom, ".cv-tab", 15000);
  check("película: el selector se reabre con ev primero", tabEs2?.textContent?.trim() === "Español", tabEs2?.textContent);
  const srvDirecto = [...doc.querySelectorAll(".cv-srv")].find((n) => (n.getAttribute("data-cv-url") || "").includes("vidsrc.sh"));
  click(dom, srvDirecto);
  const frameDirecto = await waitFor(dom, ".player-wrap iframe");
  check("película: iframe al pulsar un reproductor directo", Boolean(frameDirecto));
  check(
    "película: el iframe apunta al embed de vidsrc",
    (frameDirecto?.getAttribute("src") || "").startsWith("https://vidsrc.sh/embed/movie?imdb="),
    frameDirecto?.getAttribute("src")
  );
  dom.window.close();
}

// ---------- serie: episodios ----------
const show = catalog.series.find((s) => /^[a-z0-9-]+$/.test(s.slug) && (s.episodes || []).length > 0);
{
  const contar = { n: 0 };
  const dom = await open(`/detalle/series/${show.slug}/`, { contar });
  await waitFor(dom, ".seasons-block");
  const doc = dom.window.document;
  check("serie: ficha con temporadas", Boolean(doc.querySelector(".seasons-block")));
  const rows = [...doc.querySelectorAll(".episodes-list a[data-cv-slug]")];
  check("serie: filas de episodio con slug", rows.length > 0, String(rows.length));
  check(
    "serie: fila con temporada y episodio",
    rows[0]?.getAttribute("data-cv-temporada") !== null && rows[0]?.getAttribute("data-cv-episodio") !== null,
    rows[0]?.outerHTML?.slice(0, 200)
  );

  click(dom, rows[0]);
  const tabs = await waitFor(dom, ".cv-tab");
  check("serie: selector abierto desde un episodio", Boolean(tabs));
  const idiomas = textos(dom, ".cv-tab");
  console.log(`  ..   pestañas del episodio: ${idiomas.join(" / ")}`);
  check(
    "serie: ev primero y cuevana como respaldo",
    JSON.stringify(idiomas) === JSON.stringify(["Español", "Cuevana"]),
    JSON.stringify(idiomas)
  );
  // En series solo vale vidsrc (por TMDB): embed69 no funciona con series.
  const urlsEp = [...doc.querySelectorAll(".cv-srv")].map((n) => n.getAttribute("data-cv-url") || "");
  check("serie: un solo reproductor directo en el episodio", urlsEp.length === 1, urlsEp.join(" | "));
  check(
    "serie: el directo del episodio es vidsrc por TMDB",
    urlsEp[0] === `https://vidsrc.sh/embed/tv?tmdb=${rows[0].getAttribute("data-cv-tmdb")}&season=1&episode=1&ds_lang=es`,
    urlsEp[0]
  );
  check("serie: sin ninguna petición a cuevana3c.pro", contar.n === 0, `${contar.n} peticiones`);
  // cuevana perezoso: al cargarlo da los 6 servidores repartidos en 4 idiomas.
  const tabCv = [...doc.querySelectorAll(".cv-tab")].find((t) => t.textContent.trim() === "Cuevana");
  click(dom, tabCv);
  await new Promise((r) => setTimeout(r, 300));
  click(dom, doc.querySelector(".cv-cargar[data-cv-cargar]"));
  await waitFor(dom, ".cv-tab", 15000);
  // Se recorren todas las pestañas: cada una pinta solo sus servidores.
  // OJO: cvPintar() sustituye el HTML entero, así que los botones de las
  // pestañas se recrean en cada clic. Hay que volver a buscarlos cada vez.
  const porIdioma = {};
  for (let i = 0; i < 5; i++) {
    const tab = [...doc.querySelectorAll(".cv-tab")][i];
    if (!tab) break;
    const nombre = tab.textContent.trim();
    click(dom, tab);
    await new Promise((r) => setTimeout(r, 120));
    porIdioma[nombre] = textos(dom, ".cv-srv").length;
  }
  const total = Object.values(porIdioma).reduce((a, b) => a + b, 0);
  console.log(`  ..   servidores del episodio: ${total} (${JSON.stringify(porIdioma)})`);
  check("serie: cuevana da sus 6 servidores", total === 6, String(total));
  // Los servidores de cuevana llevan el wrapper con ?token= (los normales) o
  // con ?v= (los de Multilenguaje). Los dos son válidos.
  const srvCv = [...doc.querySelectorAll(".cv-srv")].find((n) => (n.getAttribute("data-cv-url") || "").includes("cuevana3c.pro"));
  click(dom, srvCv);
  const frameCv = await waitFor(dom, ".player-wrap iframe");
  check(
    "serie: iframe de cuevana al pulsar un servidor",
    /^https:\/\/tungtungsahur\.cuevana3c\.pro\/\?(token|v)=/.test(frameCv?.getAttribute("src") || ""),
    frameCv?.getAttribute("src")
  );

  // Y el reproductor directo del episodio, al final (sustituiría el selector).
  click(dom, rows[0]);
  const tabEsEp = await waitFor(dom, ".cv-tab", 15000);
  check("serie: el selector se reabre con ev primero", tabEsEp?.textContent?.trim() === "Español", tabEsEp?.textContent);
  const srvDirecto = [...doc.querySelectorAll(".cv-srv")].find((n) => (n.getAttribute("data-cv-url") || "").includes("vidsrc.sh"));
  click(dom, srvDirecto);
  const frameDirecto = await waitFor(dom, ".player-wrap iframe");
  check(
    "serie: iframe al pulsar el reproductor directo",
    (frameDirecto?.getAttribute("src") || "").startsWith("https://vidsrc.sh/embed/tv?tmdb="),
    frameDirecto?.getAttribute("src")
  );
  dom.window.close();
}

// ---------- home: tarjetas de episodio ----------
{
  const dom = await open("/");
  await waitFor(dom, ".episode-card");
  const card = dom.window.document.querySelector(".episode-card");
  check("home: tarjeta de episodio con slug", Boolean(card?.getAttribute("data-cv-slug")), card?.outerHTML?.slice(0, 200));
  check(
    "home: sin URLs de vídeo en el DOM",
    !dom.window.document.body.innerHTML.includes(["tung", "tungsahur"].join("")) &&
      !dom.window.document.body.innerHTML.includes("vidapi")
  );
  dom.window.close();
}

// ---------- cuevana3c.pro caído ----------
// Los reproductores de ev.pelislatinohd.com NO dependen de cuevana para nada:
// se construyen con los ids del catálogo, así que tienen que salir sin que se
// haya intentado ninguna petición. Y si el usuario insiste y abre la pestaña
// Cuevana, al fallar se vuelve a estos sin perderlos.
{
  const contar = { n: 0 };
  const dom = await open("/detalle/movie/007-al-servicio-secreto-de-su-majestad/", { cuevanaCaido: true, contar });
  await waitFor(dom, ".play-btn");
  const doc = dom.window.document;
  const btn = doc.querySelector(".play-btn");
  const imdb = btn?.getAttribute("data-cv-imdb");
  const tmdb = btn?.getAttribute("data-cv-tmdb");
  check("respaldo: el botón lleva el id de IMDb", /^tt\d+$/.test(imdb || ""), btn?.outerHTML?.slice(0, 260));
  check("respaldo: el botón lleva el id de TMDB", /^\d+$/.test(tmdb || ""), tmdb);

  click(dom, btn);
  const tab = await waitFor(dom, ".cv-tab", 15000);
  check("respaldo: aparece el selector pese a la caída", Boolean(tab), doc.querySelector(".cv-caja")?.textContent?.slice(0, 160));
  const nombres = textos(dom, ".cv-srv");
  check(
    "respaldo: se ofrecen los dos embeds de ev.pelislatinohd.com",
    nombres.some((t) => t.includes("VidSrc")) && nombres.some((t) => t.includes("Embed69")),
    nombres.join(" | ")
  );
  const urls = [...doc.querySelectorAll(".cv-srv")].map((n) => n.getAttribute("data-cv-url") || "");
  check(
    "respaldo: la URL de vidsrc usa el id de IMDb y pide español",
    urls.some((u) => u === `https://vidsrc.sh/embed/movie?imdb=${imdb}&ds_lang=es`),
    urls.join(" | ")
  );
  check(
    "respaldo: la URL de embed69 usa el id de IMDb",
    urls.some((u) => u === `https://embed69.org/f/${imdb}/`),
    urls.join(" | ")
  );
  // Lo fuerte: con cuevana caído, sacar los reproductores directos no ha
  // costado NI UNA petición. No hay nada que se pueda caer.
  check("respaldo: ni una petición a cuevana3c.pro", contar.n === 0, `${contar.n} peticiones`);

  // La pestaña Español tiene que seguir respondiendo al clic.
  const tabEs = [...doc.querySelectorAll(".cv-tab")].find((t) => t.textContent.trim() === "Español");
  click(dom, tabEs);
  await new Promise((r) => setTimeout(r, 200));
  check(
    "respaldo: la pestaña sigue viva tras el clic",
    textos(dom, ".cv-srv").length === 2,
    textos(dom, ".cv-srv").join(" | ")
  );

  // Y si el usuario abre la pestaña Cuevana estando caída, no se queda sin
  // nada: se avisa y se vuelven a pintar los reproductores directos.
  const tabCv = [...doc.querySelectorAll(".cv-tab")].find((t) => t.textContent.trim() === "Cuevana");
  click(dom, tabCv);
  await new Promise((r) => setTimeout(r, 300));
  click(dom, doc.querySelector(".cv-cargar[data-cv-cargar]"));
  await new Promise((r) => setTimeout(r, 2500));
  const nota = doc.querySelector(".cv-nota")?.textContent || "";
  console.log(`  ..   nota: ${nota.slice(0, 90)}`);
  check("respaldo: cuevana caído se intentó al pedirlo", contar.n > 0, `${contar.n} peticiones`);
  check("respaldo: avisa de que cuevana no ha respondido", /no ha respondido/i.test(nota), nota);
  check(
    "respaldo: recupera los reproductores directos",
    textos(dom, ".cv-srv").length === 2,
    textos(dom, ".cv-srv").join(" | ")
  );
  dom.window.close();
}

// ---------- respaldo en un episodio ----------
// En series el catálogo lleva TMDB, no IMDb: el respaldo tiene que usar el
// TMDB y NO ofrecer embed69, que con series no funciona.
{
  const dom = await open("/detalle/series/siren/", { cuevanaCaido: true });
  const fila = await waitFor(dom, ".seasons a[data-cv-slug]");
  const imdbEp = fila?.getAttribute("data-cv-imdb");
  const tmdbEp = fila?.getAttribute("data-cv-tmdb");
  check("respaldo: la fila de episodio lleva el TMDB", /^\d+$/.test(tmdbEp || ""), tmdbEp);
  check("respaldo: la fila de episodio no finge un IMDb", !imdbEp, imdbEp);

  click(dom, fila);
  await waitFor(dom, ".cv-srv", 15000);
  const urls = [...dom.window.document.querySelectorAll(".cv-srv")].map((n) => n.getAttribute("data-cv-url") || "");
  check(
    "respaldo: el episodio se resuelve por TMDB",
    urls.some((u) => u.includes("vidsrc.sh/embed/tv") && u.includes(`tmdb=${tmdbEp}`) && u.includes("ds_lang=es")),
    urls.join(" | ")
  );
  check(
    "respaldo: embed69 no se ofrece en episodios",
    !urls.some((u) => u.includes("embed69")),
    urls.join(" | ")
  );
  dom.window.close();
}

server.close();
console.log(
  failures.length
    ? `\n${failures.length} fallo(s)`
    : `\nUI: todas las comprobaciones pasaron${PREFIX ? ` (bajo ${PREFIX}/)` : ""}`
);
process.exit(failures.length ? 1 : 0);
