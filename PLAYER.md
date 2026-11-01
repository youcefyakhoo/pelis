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

## Validar cambios

```bash
node scripts/check-player-sources.mjs
```

Comprueba el esquema, la resolución para películas/series/episodios, que un
embed solo aparezca cuando corresponde y que no haya hosts de streaming pirata
en `js/`, `scraper/` ni `data/`.

## Notas

- `data/catalog.json` guarda solo metadatos e identificadores (`tmdb`,
  `externalId`); no contiene URLs de vídeo.
- `scraper/scrape.mjs` ya no escribe campos `embedded` ni construye players.
- Los enlaces a JustWatch / TMDB / IMDb son informativos; el sitio no está
  afiliado a ellos.
