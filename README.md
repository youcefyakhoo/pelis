# Pelis

Catálogo estático de películas y series en español: fichas, temporadas,
episodios, buscador y navegación por género, país y etiquetas. Sin backend: HTML,
CSS y JavaScript que se sirven desde cualquier hosting estático (GitHub Pages,
Cloudflare Workers, Netlify…).

## Estructura

| Ruta                   | Contenido                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `index.html`           | Shell de la SPA (con `<base href="/">` para el fallback de rutas) |
| `js/app.js`            | Router, vistas, buscador y reproductor                           |
| `js/gam.js`            | Anuncios (Google Ad Manager)                                     |
| `data/catalog.json`    | Catálogo (metadatos, reparto, episodios) generado por el scraper |
| `data/servers.json`    | **Fuentes del reproductor** (ver [`PLAYER.md`](PLAYER.md))        |
| `detalle/<tipo>/<slug>/index.html` | Fichas estáticas con metadatos Open Graph              |
| `scraper/`             | Scraper completo + actualizador incremental                      |
| `scripts/`             | Generador de páginas sociales y comprobaciones                   |

## Reproductor

El sitio **no aloja ni transmite vídeo**. Al pulsar *Reproducir* se abre un
panel con fuentes configurables desde `data/servers.json`: tráiler oficial,
JustWatch, fichas de TMDB/IMDb y enlaces a plataformas de streaming. También
admite un `embed` propio si distribuyes contenido con derechos.

- Esquema y marcadores: [`PLAYER.md`](PLAYER.md)
- Cambiar o añadir fuentes: edita `data/servers.json` (no hace falta recompilar)
- Tráiler y disponibilidad reales: `node scripts/enrich-tmdb.mjs` (TMDB)

## Desarrollo

No hay build. Para probar en local:

```bash
npm run dev
# abre http://localhost:8080
```

El servidor de desarrollo (`scripts/dev-server.mjs`) replica el fallback del
hosting: las rutas sin fichero (`/genero/accion`, `/pais/mexico`, `/tag/anime`…)
devuelven `index.html`. Con `python3 -m http.server` esas rutas dan 404 si se
escriben a mano, porque no hace rewriting.

Comprobaciones:

```bash
node scripts/check-player-sources.mjs   # esquema y resolución de fuentes
npm install                              # solo para los tests con jsdom
node scripts/check-routes.mjs            # rutas reales y fallback SPA, sin errores JS
node scripts/check-player-ui.mjs         # render del panel del reproductor
npm run check                            # los tres
```

## Catálogo

```bash
node scraper/scrape.mjs    # reconstrucción completa -> data/catalog.json
node scraper/update.mjs    # sólo novedades (lo ejecuta GitHub Actions cada 6 h)
node scripts/enrich-tmdb.mjs             # tráiler y plataformas (requiere TMDB_API_KEY)
node scripts/generate-social-pages.mjs   # fichas con Open Graph
```

`enrich-tmdb` es opcional: sin credenciales termina sin cambios. Con el secreto
`TMDB_API_KEY` configurado, el workflow añade tráiler oficial de YouTube y la
disponibilidad real por plataforma (región `PE` por defecto) al catálogo.

El workflow `.github/workflows/update-catalog.yml` actualiza el catálogo y las
fichas sociales de forma programática.

## Aviso legal

Este proyecto es una demo de catálogo. No aloja, enlaza ni transmite contenido
audiovisual de terceros. Las fuentes del reproductor deben apuntar únicamente a
servicios oficiales o a contenido propio/licenciado; consulta `PLAYER.md`.
