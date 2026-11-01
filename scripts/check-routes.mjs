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
const BASE = `http://127.0.0.1:${PORT}`;

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
  try {
    let file = join(ROOT, pathname);
    const s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file).catch(() => readFile(join(ROOT, "index.html")));
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const errors = [];
const resources = {
  interceptors: [
    requestInterceptor((request) => {
      if (new URL(request.url).hostname === "127.0.0.1") return undefined;
      return new Response("", { status: 204, headers: { "content-type": "text/plain" } });
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
  return JSDOM.fromURL(BASE + path, {
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
for (const [path, selector, label] of ROUTES) {
  const dom = await open(path);
  const ok = Boolean(await waitFor(dom, selector));
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label} (${path})`);
  if (!ok) failures++;
  dom.window.close();
}

server.close();
if (errors.length) {
  failures += errors.length;
  console.error(`\nErrores de JavaScript:\n${errors.join("\n")}`);
}
console.log(failures ? `\n${failures} fallo(s)` : "\nRutas: todas las comprobaciones pasaron");
process.exit(failures ? 1 : 0);
