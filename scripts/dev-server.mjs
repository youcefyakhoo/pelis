// Servidor de desarrollo con fallback SPA, para probar en local igual que en el
// hosting (rutas como /genero/accion o /tag/anime no tienen fichero propio).
//
// Uso: node scripts/dev-server.mjs [puerto]   (por defecto 8080, o $PORT)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  // evita salir del directorio del proyecto
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  try {
    let file = join(ROOT, safe);
    const info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) file = join(file, "index.html");
    // fallback SPA: lo que no existe se sirve como index.html (200)
    const body = await readFile(file).catch(() => readFile(join(ROOT, "index.html")));
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Pelis en http://localhost:${PORT} (fallback SPA activo)`);
});
