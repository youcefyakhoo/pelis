// PelisLatinoHD clone - extractor de servidores de Cuevana 3
//
// La web de cuevana3c.pro publica, en la página de cada título, una pestaña por
// idioma (Latino / Castellano / Subtitulado / Multilenguaje) y dentro de cada
// una la lista de servidores. Este módulo baja esa página, la interpreta y
// devuelve los servidores agrupados por idioma.
//
// Se carga como script clásico (no módulo) porque index.html hace
// <script src="js/app.js"></script>: define el global `Cuevana`.
//
// Las funciones de parseo son puras (sin red) para poder probarlas con
// scripts/check-player-sources.mjs sin navegador.

const Cuevana = (() => {
  "use strict";

  // ---- configuración del sitio ------------------------------------------

  /** Sitio del que se saca la lista de servidores. */
  const BASE = "https://cuevana3c.pro/";
  const PELICULA = BASE + "pelicula/";
  const SERIE = BASE + "serie/";

  /** Wrapper que oculta la URL real del reproductor. */
  const WRAPPER = "https://tungtungsahur.cuevana3c.pro/";

  /**
   * Clave XOR con la que el wrapper cifra el token. Está en el propio
   * wrapper: `var key = 'a45f04ce'+'-'+'2394'+'-'+'47c3'+'-'+'b718'+'-'+'0ecd97ce51d6'`.
   */
  const CLAVE = "a45f04ce-2394-47c3-b718-0ecd97ce51d6";

  /** Hosts reales, indexados por el primer carácter del token. */
  const HOST = {
    1: "https://ikhjerbhye3wjkhoduh5xiczuvd.lol/v/",
    2: "https://filemoon.sx/e/",
    3: "https://lkhjerbhye3wjkhodvh5xlczuvd.lol/e/",
    4: "https://dood.li/e/",
  };

  // ---- patrones (los mismos que usa el resolver de la app Android) -------

  /** <li class="tab-video-item"> … una pestaña de idioma completa. */
  const RE_PESTANA = /<li\s+class="tab-video-item"[^>]*>/gi;

  /** <div class="tab-item-name"> Latino <div …>Calidad · HD</div></div> */
  const RE_IDIOMA = /class="tab-item-name"[^>]*>\s*([^<]+?)\s*</i;

  /** Un servidor completo: <li role="presentation" data-server="URL">…</li> */
  const RE_SERVIDOR = /<li\s+role="presentation"\s+data-server="([^"]+)"[^>]*>(.*?)<\/li>/gis;

  /** El primer <span> de dentro del <li>, que es el nombre del servidor. */
  const RE_NOMBRE = /<span>\s*(?:Servidor\s+)?([^<]+?)\s*<\/span>/i;

  // ---- URLs ---------------------------------------------------------------

  /**
   * Página de cuevana3c.pro de un título.
   * @param {{slug:string, tipo?:"movie"|"series", temporada?:string|number, episodio?:string|number}} ctx
   */
  function urlPagina(ctx) {
    const slug = String(ctx && ctx.slug ? ctx.slug : "").trim();
    if (!slug) return null;
    if (ctx.tipo === "series") {
      const t = String(ctx.temporada ?? "1").trim();
      const e = String(ctx.episodio ?? "1").trim();
      return `${SERIE}${encodeURIComponent(slug)}/episodio-${t}x${e}`;
    }
    return `${PELICULA}${encodeURIComponent(slug)}`;
  }

  /** ¿Es una URL del wrapper? */
  function esWrapper(url) {
    return typeof url === "string" && url.startsWith(WRAPPER);
  }

  // ---- descifrado del wrapper --------------------------------------------

  function b64aBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function xorConClave(bytes, clave) {
    const key = new TextEncoder().encode(clave);
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ key[i % key.length];
    return out;
  }

  function bytesAtexto(bytes) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  /**
   * Descifra una URL del wrapper y devuelve la URL real del reproductor.
   *   ?token=X → HOST[X[0]] + XOR(atob(X sin el primer carácter), CLAVE)
   *   ?v=BASE64 → atob(BASE64)
   */
  function descifrarWrapper(url) {
    if (!esWrapper(url)) return null;
    let q;
    try {
      q = new URL(url).searchParams;
    } catch {
      return null;
    }
    const token = q.get("token");
    if (token && token.length > 1) {
      const host = HOST[token[0]];
      if (!host) return null;
      try {
        return host + bytesAtexto(xorConClave(b64aBytes(token.slice(1)), CLAVE));
      } catch {
        return null;
      }
    }
    const v = q.get("v");
    if (v) {
      try {
        return bytesAtexto(b64aBytes(v));
      } catch {
        return null;
      }
    }
    return null;
  }

  // ---- parseo de la página ------------------------------------------------

  /** Orden de idioma que se pidió: Latino, Castellano, Subtitulado y el resto. */
  function prioridadIdioma(grupo) {
    const g = String(grupo || "").toLowerCase();
    if (g.includes("latino")) return 0;
    if (g.includes("castellano")) return 1;
    if (g.includes("subtitul")) return 2;
    return 3;
  }

  function limpiar(s) {
    return String(s || "")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .trim();
  }

  /**
   * Saca de la HTML los servidores, en el orden en que salen en la página.
   * Devuelve [{idioma, nombre, url}].
   *
   * OJO: el <li> de cada pestaña contiene un <ul> con más <li> dentro, así que
   * no se puede buscar "</li>" para acotar la pestaña. Se corta por el
   * comienzo de la pestaña siguiente, que es lo que hace el resolver de Java.
   */
  function extraerServidores(html) {
    const texto = String(html || "");
    const salida = [];

    const cortes = [];
    RE_PESTANA.lastIndex = 0;
    let m;
    while ((m = RE_PESTANA.exec(texto)) !== null) cortes.push(m.index);
    if (!cortes.length) return salida;

    for (let i = 0; i < cortes.length; i++) {
      const trozo = texto.slice(cortes[i], i + 1 < cortes.length ? cortes[i + 1] : texto.length);

      const mi = RE_IDIOMA.exec(trozo);
      if (!mi) continue;
      const idioma = limpiar(mi[1]);
      if (!idioma) continue;

      RE_SERVIDOR.lastIndex = 0;
      let ms;
      while ((ms = RE_SERVIDOR.exec(trozo)) !== null) {
        const url = limpiar(ms[1]);
        if (!url || url.startsWith("about:") || !/^https?:/i.test(url)) continue;

        let nombre = "";
        const mn = RE_NOMBRE.exec(ms[2]);
        if (mn) nombre = limpiar(mn[1]);
        if (!nombre) nombre = "srv" + (salida.length + 1);

        salida.push({ idioma, nombre, url });
      }
    }
    return salida;
  }

  /**
   * Agrupa la lista plana por idioma, en el orden pedido
   * (Latino → Castellano → Subtitulado → resto). Dentro de cada idioma se
   * conserva el orden de la página.
   * Devuelve [{idioma, servidores:[{nombre, url}]}].
   */
  function agruparPorIdioma(lista) {
    const grupos = new Map();
    for (const s of lista || []) {
      if (!grupos.has(s.idioma)) grupos.set(s.idioma, []);
      grupos.get(s.idioma).push({ nombre: s.nombre, url: s.url });
    }
    return [...grupos.entries()]
      .map(([idioma, servidores]) => ({ idioma, servidores }))
      .sort((a, b) => prioridadIdioma(a.idioma) - prioridadIdioma(b.idioma));
  }

  // ---- acceso a la red (solo navegador) -----------------------------------

  /** Cabeceras suficientes para que cuevana3c.pro conteste. */
  function cabeceras() {
    return { Accept: "text/html,application/xhtml+xml" };
  }

  /**
   * Baja la página del título y devuelve los servidores agrupados por idioma.
   * Lanza excepción si la página no se puede leer o no trae servidores.
   */
  async function buscarServidores(ctx) {
    const url = urlPagina(ctx);
    if (!url) throw new Error("falta el slug del título");

    const res = await fetch(url, { headers: cabeceras(), credentials: "omit" });
    if (!res.ok) throw new Error(`cuevana3c.pro respondió ${res.status}`);

    const html = await res.text();
    const grupos = agruparPorIdioma(extraerServidores(html));
    if (!grupos.length) throw new Error("la página no trae servidores");
    return grupos;
  }

  return {
    BASE,
    WRAPPER,
    urlPagina,
    esWrapper,
    descifrarWrapper,
    prioridadIdioma,
    extraerServidores,
    agruparPorIdioma,
    buscarServidores,
  };
})();

// En navegador se cuelga del window; en Node (para los checks) queda como
// variable del módulo. `typeof window` evita el ReferenceError.
if (typeof window !== "undefined") window.Cuevana = Cuevana;
if (typeof globalThis !== "undefined") globalThis.Cuevana = Cuevana;
