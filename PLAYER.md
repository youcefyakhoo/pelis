# Reproductor y fuentes (`data/servers.json`)

El sitio ya **no** lleva ningún host de vídeo incrustado en el código ni en el
catálogo. Las opciones del botón **Reproducir** y de cada episodio se resuelven
en el navegador a partir de `data/servers.json`.

Regla del proyecto: aquí solo se configuran **servicios oficiales** (tráiler,
fichas, plataformas de streaming) o **embeds de contenido propio o licenciado**.
El sitio no aloja ni transmite vídeo.

## Cómo funciona

```
data/catalog.json  →  ids (tmdb, externalId)
        │
        ▼
js/app.js  ── fetch ──▶  data/servers.json
        │
        ▼
panel del reproductor (tráiler, dónde verlo, plataformas, embed licenciado)
```

- Al pulsar **Reproducir** (o un episodio) se abre un panel dentro de la ficha.
- Los enlaces tipo `link` se abren en una pestaña nueva con
  `rel="noopener noreferrer nofollow"`.
- Los enlaces tipo `embed` se cargan en un `<iframe>` dentro del panel. Están
  pensados para un catálogo propio con derechos (tu CDN, tu DRM, tus URLs
  firmadas).
- Si `data/servers.json` no se puede cargar, el cliente usa un modo de
  emergencia con solo la búsqueda de tráiler.

## Reproductores de ev.pelislatinohd.com

Las fuentes `vidsrc-es` y `embed69` apuntan al reproductor público de
ev.pelislatinohd.com. Se construyen con los ids que el catálogo **ya** trae, así
que el selector se pinta **sin hacer ninguna petición de red**: no depende de que
ningún servidor esté en línea ni del rate-limiting.

```
data/catalog.json  →  ids (imdb para películas, tmdb para series)
        │
        ▼  js/app.js  (cvDirectos → cvAbrir → cvPintar)
[{idioma: "Español", servidores:[{nombre, url}]}]
        │
        ▼  clic en un servidor
<iframe src="https://vidsrc.sh/embed/movie?imdb=…&ds_lang=es">
```

Comprobado en vivo (2026-11-03) contra títulos reales:

- `vidsrc-es` → 200 con página propia, en película **y** en episodio.
- `embed69` → 200 con el título correcto, **pero solo en película**: con series
  devuelve `{"error":"No folders found"}`.

Por eso `embed69` lleva `"appliesTo": ["movie"]`.

## Esquema

```jsonc
{
  "version": 1,
  "sources": [
    {
      "id": "trailer",                  // identificador único
      "name": "Tráiler oficial",        // texto del botón
      "kind": "link",                   // "link" (pestaña nueva) | "embed" (iframe)
      "icon": "▶",                      // opcional
      "primary": true,                  // botón destacado
      "order": 10,                      // menor = antes
      "enabled": true,                  // false = se ignora
      "appliesTo": ["movie", "series"], // opcional (por defecto ambas)
      "url": "https://…{query}…",       // plantilla para películas/series
      "episodeUrl": "https://…{season}…" // opcional: plantilla para episodios
    }
  ],
  "providers": [
    { "id": "netflix", "name": "Netflix", "url": "https://www.netflix.com/search?q={query}" }
  ]
}
```

### Marcadores disponibles

| Marcador         | Valor                                                        |
| ---------------- | ------------------------------------------------------------ |
| `{query}`        | título + año, codificado para URL (`El+padrino+1972`)        |
| `{title}`        | título codificado                                            |
| `{year}`         | año                                                          |
| `{type}`         | `movie` o `series`                                           |
| `{media}`        | `movie` o `tv` (formato TMDB)                                |
| `{tmdb}`         | id numérico de TMDB (vacío si el título no lo tiene)         |
| `{imdb}`         | id de IMDb (`tt0081249`)                                     |
| `{slug}`         | slug del título                                              |
| `{season}`       | temporada (solo episodios)                                   |
| `{episode}`      | episodio (solo episodios)                                    |
| `{episodeLabel}` | `T1E5` (solo episodios)                                      |

Si una plantilla usa un marcador que no tiene valor para ese título, la fuente
se descarta (así no se generan enlaces a `/null`). Los valores se codifican
automáticamente: **no** codifiques tú el texto dentro de la plantilla, pero sí
puedes dejar texto ya codificado fuera de los marcadores.

### Ejemplo: conectar tu propio catálogo licenciado

```jsonc
{
  "id": "propio",
  "name": "Mi catálogo",
  "kind": "embed",
  "order": 1,
  "appliesTo": ["movie", "series"],
  "url": "https://stream.midominio.com/embed/{media}/{tmdb}",
  "episodeUrl": "https://stream.midominio.com/embed/{media}/{tmdb}?t={season}&e={episode}"
}
```

Para activarlo, cambia `enabled` a `true` (o elimina la clave) y pon tu host.
Si tu reproductor necesita un token, genera la URL desde tu backend y expón un
endpoint que devuelva el `servers.json` ya firmado; el cliente solo consume
plantillas.

## Tráiler oficial y disponibilidad (TMDB)

`scripts/enrich-tmdb.mjs` añade al catálogo datos reales de TMDB:

| Campo                         | Contenido                                              |
| ----------------------------- | ------------------------------------------------------ |
| `trailerKey`                  | id del tráiler oficial en YouTube                      |
| `trailerName`, `trailerLang`  | título e idioma del vídeo elegido                      |
| `providers`                   | plataformas oficiales del país (`id`, `name`, `type`, `logo`) |
| `providersRegion`             | país usado (`PE` por defecto)                          |
| `providerLink`                | página "dónde verlo" de TMDB                           |

El panel usa `trailerKey` para incrustar el tráiler desde
`https://www.youtube-nocookie.com/embed/…` (fuente `trailer-embed` de
`data/servers.json`, que se descarta sola si el título no tiene tráiler) y
muestra las plataformas reales en *Dónde verlo*. Sin datos de TMDB se mantienen
los enlaces de búsqueda genéricos.

```bash
# local
TMDB_API_KEY=tu_clave node scripts/enrich-tmdb.mjs --limit 20

# sólo lo que aún no tiene tráiler, simulando sin escribir
TMDB_TOKEN=tu_token node scripts/enrich-tmdb.mjs --only-missing --dry-run

```

Variables: `TMDB_API_KEY` (v3) o `TMDB_TOKEN` (v4), `TMDB_REGION` (por defecto
`PE`), `TMDB_LANG` (`es-ES`), `TMDB_BASE`, `TMDB_CONCURRENCY` (8),
`TMDB_TIMEOUT_MS`. Argumentos: `--catalog`, `--limit`, `--only-missing`,
`--concurrency`, `--dry-run`.

En CI basta con crear el secreto `TMDB_API_KEY` (o `TMDB_TOKEN`) en el
repositorio: el workflow `update-catalog` ejecuta el enriquecimiento y salta el
paso si el secreto no existe. Sin credenciales el script termina sin tocar nada.

> TMDB no ofrece disponibilidad inventada: si un título no está en ninguna
> plataforma del país, `providers` queda vacío y se muestran los enlaces de
> búsqueda. Cambia `TMDB_REGION` si tu público no es de Perú.

## Validar cambios

```bash
node scripts/check-player-sources.mjs
```

Comprueba el esquema, la resolución para películas/series/episodios, que un
embed solo aparezca cuando corresponde y que no haya hosts de streaming pirata
en `js/`, `scraper/` ni `data/`.

```bash
npm run check      # player + rutas + UI + páginas (necesita npm install)
```

`check-player-sources.mjs` comprueba el motor del reproductor y la
configuración sin navegador.

## Notas

- `data/catalog.json` guarda solo metadatos e identificadores (`tmdb`,
  `externalId`); no contiene URLs de vídeo.
- `scraper/scrape.mjs` ya no escribe campos `embedded` ni construye players.
- Los enlaces a JustWatch / TMDB / IMDb son informativos; el sitio no está
  afiliado a ellos.
