import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const catalog = JSON.parse(readFileSync(join(ROOT, "data/catalog.json"), "utf8"));
const template = readFileSync(join(ROOT, "index.html"), "utf8");
const origin = process.env.SITE_ORIGIN || "https://pelis.plisplus.workers.dev";

const esc = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const truncate = (value, max = 240) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
};

const items = [...(catalog.movies || []), ...(catalog.series || [])];

for (const item of items) {
  const title = item.title || "PelisLatinoHD";
  const description = truncate(
    item.synopsis || `Ver ${title} online en PelisLatinoHD.`
  );
  const image = item.backdrop || item.poster || `${origin}/social-default.jpg`;
  const type = item.type === "movie" ? "video.movie" : "video.tv_show";
  const url = `${origin}/detalle/${item.type}/${item.slug}/`;
  const folder = join(ROOT, "detalle", item.type, item.slug);

  mkdirSync(folder, { recursive: true });

  const socialHead = `
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="PelisLatinoHD">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">`;

  const page = template
    .replace("<head>", `<head>\n<base href="/">${socialHead}`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${esc(description)}" />`
    )
    .replace(
      /<title>[^<]*<\/title>/,
      `<title>${esc(title)} - PelisLatinoHD</title>`
    );

  writeFileSync(join(folder, "index.html"), page);
}

console.log(`[social-pages] Generated ${items.length} detail pages.`);