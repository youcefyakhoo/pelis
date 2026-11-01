// Smoke test de rutas: comprueba que la SPA arranca en rutas servidas por el
// fallback del hosting (no existe fichero para /genero/*, /pais/*, /tag/*) y que
// ninguna página lanza errores de JavaScript.
//
// Requiere la dependencia de desarrollo: npm install
// Uso: node scripts/check-routes.mjs
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 4321);
// PREFIX=/pelis simula un project site de GitHub Pages (sitio bajo subruta).
const PREFIX = `/${String(process.env.PREFIX || "").replace(/^\/+|\/+$/g, "")}`.replace(/^\/$/, "");
// FALLBACK=404 reproduce GitHub Pages: lo que no existe devuelve 404.html (404)
// en vez de index.html. Sin esa variable se imita un rewrite SPA (200).
const PAGES_MODE = String(process.env.FALLBACK || "").trim() === "404";
const BASE = `http://127.0.0.1:${PORT}${PREFIX}`;

let jsdomPkg;
try {
  jsdomPkg = (await import("jsdom")).default;
} catch {
  console.log("jsdom no está instalado; ejecuta `npm install` para correr este test.");
  process.exit(0);
}
const { JSDOM, VirtualConsole, requestInterceptor } = jsdomPkg;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8",
};

// Servidor con fallback SPA: cualquier ruta sin fichero devuelve index.html,
// igual que hace el hosting con `/* /index.html 200`.
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
    const exists = await stat(file).then((x) => x.isFile()).catch(() => false);
    if (!exists) {
      // en Pages una ruta inexistente no sirve index.html: sirve 404.html
      const body = await readFile(join(ROOT, PAGES_MODE ? "404.html" : "index.html"));
      res.writeHead(PAGES_MODE ? 404 : 200, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const errors = [];
const resources = {
  interceptors: [
    requestInterceptor((request) => {
      const url = new URL(request.url);
      if (url.hostname !== "127.0.0.1") {
        return new Response("", { status: 204, headers: { "content-type": "text/plain" } });
      }
      // fuera del prefijo = 404, como en el hosting real
      if (PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) {
        errors.push(`${url.pathname}: fuera de ${PREFIX}/`);
        return new Response("", { status: 404 });
      }
      return undefined;
    }),
  ],
};

async function open(path) {
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => {
    if (!/Could not load|resource|XMLHttpRequest|css/i.test(String(e.message))) {
      errors.push(`${path}: ${e.message}`);
    }
  });
  vc.on("error", (...a) => errors.push(`${path}: console.error ${a.join(" ")}`));
  // jsdom rechaza documentos servidos con 404: el HTML se pide aparte.
  const response = await fetch(BASE + path);
  const html = await response.text();
  return new JSDOM(html, {
    url: BASE + path,
    runScripts: "dangerously",
    resources,
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      window.fetch = (input, init) => globalThis.fetch(new URL(input, window.document.baseURI || window.location.href), init);
      window.scrollTo = () => {};
      window.Element.prototype.scrollIntoView = () => {};
      window.addEventListener("error", (e) => errors.push(`${path}: window.error ${e.message}`));
    },
  });
}

const waitFor = async (dom, selector, timeout = 15000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const node = dom.window.document.querySelector(selector);
    if (node) return node;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
};

const ROUTES = [
  ["/", ".items .item", "home"],
  ["/peliculas", ".items .item", "listado de películas"],
  ["/series", ".items .item", "listado de series"],
  ["/episodios", ".episode-card", "episodios"],
  ["/tendencias", ".items .item", "tendencias"],
  ["/genero/accion", ".items .item", "género (fallback SPA)"],
  ["/pais/mexico", ".items .item", "país (fallback SPA)"],
  ["/tag/anime", ".items .item", "tag (fallback SPA)"],
  ["/detalle/movie/007-al-servicio-secreto-de-su-majestad/", ".detail-head", "ficha de película"],
  ["/detalle/series/siren/", ".seasons-block", "ficha de serie"],
  ["/privacidad", ".legal-page", "página legal"],
];

let failures = 0;
const check = (label, cond, extra = "") => {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}${!cond && extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

for (const [path, selector, label] of ROUTES) {
  const dom = await open(path);
  const ok = Boolean(await waitFor(dom, selector));
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label} (${path})`);
  if (!ok) failures++;
  dom.window.close();
}

// ---------- navegación SPA (respeta el prefijo) ----------
{
  const dom = await open("/");
  await waitFor(dom, ".items .item");
  const doc = dom.window.document;
  const navPelis = doc.querySelector('a[data-route="peliculas"]');
  check("nav: enlace de Películas presente", Boolean(navPelis));
  // el href puede ser relativo ("peliculas"): se compara la URL resuelta
  check(
    `nav: enlace resuelto a ${PREFIX}/peliculas`,
    Boolean(navPelis) && new URL(navPelis.href).pathname === `${PREFIX}/peliculas`,
    navPelis?.href
  );
  navPelis.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await waitFor(dom, ".page-title");
  check("nav: la SPA navega sin recargar", doc.querySelector(".page-title")?.textContent.includes("Películas"), doc.querySelector(".page-title")?.textContent);
  check(
    `nav: URL actualizada a ${PREFIX}/peliculas`,
    dom.window.location.pathname === `${PREFIX}/peliculas`,
    dom.window.location.pathname
  );
  // ningún enlace interno debe quedarse sin prefijo
  const stray = [...doc.querySelectorAll('a[href^="/"]')]
    .map((a) => a.getAttribute("href"))
    .filter((h) => PREFIX && !h.startsWith(`${PREFIX}/`) && h !== PREFIX);
  check("nav: sin enlaces absolutos fuera del prefijo", stray.length === 0, stray.slice(0, 3).join(", "));
  dom.window.close();
}

server.close();
if (errors.length) {
  failures += errors.length;
  console.error(`\nErrores de JavaScript:\n${errors.join("\n")}`);
}
console.log(
  failures
    ? `\n${failures} fallo(s)`
    : `\nRutas: todas las comprobaciones pasaron${PREFIX ? ` (bajo ${PREFIX}/)` : ""}${PAGES_MODE ? " con 404.html" : ""}`
);
process.exit(failures ? 1 : 0);
