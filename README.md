# Pelis

Catálogo estático de películas y series en español: fichas, temporadas,
episodios, buscador y navegación por género, país y etiquetas. Sin backend: HTML,
CSS y JavaScript que se sirven desde cualquier hosting estático (GitHub Pages,
Cloudflare Workers, Netlify…).

## Estructura

| Ruta                   | Contenido                                                        |
| ---------------------- | ---------------------------------------------------------------- |
| `index.html`           | Shell de la SPA (una sola página para todo el sitio)             |
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

## Desarrollo

No hay build. Para probar en local:

```bash
python3 -m http.server 8080
# abre http://localhost:8080
```

Comprobaciones:

```bash
node scripts/check-player-sources.mjs   # esquema y resolución de fuentes
npm install                              # solo para el test de interfaz
node scripts/check-player-ui.mjs         # render del panel con jsdom
```

## Catálogo

```bash
node scraper/scrape.mjs    # reconstrucción completa -> data/catalog.json
node scraper/update.mjs    # sólo novedades (lo ejecuta GitHub Actions cada 6 h)
node scripts/generate-social-pages.mjs   # fichas con Open Graph
```

El workflow `.github/workflows/update-catalog.yml` actualiza el catálogo y las
fichas sociales de forma programática.

## Aviso legal

Este proyecto es una demo de catálogo. No aloja, enlaza ni transmite contenido
audiovisual de terceros. Las fuentes del reproductor deben apuntar únicamente a
servicios oficiales o a contenido propio/licenciado; consulta `PLAYER.md`.
