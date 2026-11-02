// Publica en la web los cambios que tengas en tu PC, en un solo paso.
//
//   node scripts/publish.mjs                 -> revisa, hace commit en main y push
//   node scripts/publish.mjs -m "mi cambio"  -> con mensaje propio
//   node scripts/publish.mjs --dry-run       -> solo enseña qué haría
//   node scripts/publish.mjs --watch         -> además espera el build de Pages
//   node scripts/publish.mjs --yes           -> sin preguntar
//
// Pensado para Windows (doble clic en publicar.bat) pero funciona igual en
// macOS y Linux. Nunca toca master salvo que uses --sync-master.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import readline from "node:readline";

const BRANCH = "main";
const REMOTE = "origin";
const MAX_FILE_MB = 25;
const BIG_FILE_MB = 5;

// Ficheros que NO deben publicarse nunca (documentos personales, temporales…).
const PERSONAL = [
  /[\\/]memory[\\/]/i,
  /[\\/]temp[\\/]/i,
  /[\\/]belkafut[\\/]/i,
  /[\\/]node_modules[\\/]/i,
  /(^|[\\/])gob_[^\\/]*$/i,
  /(^|[\\/])sunat_[^\\/]*$/i,
  /(^|[\\/])or_[^\\/]*$/i,
  /(^|[\\/])r_[^\\/]*\.htm$/i,
  /(^|[\\/])rer\d*\.html?$/i,
  /(^|[\\/])pa_pl_[^\\/]*$/i,
  /(^|[\\/])paginas_amarillas_[^\\/]*$/i,
  /(^|[\\/])temp-[^\\/]*\.js$/i,
  /(^|[\\/])scrape-canales\.js$/i,
  /(^|[\\/])update-canales\.yml$/i,
  /(^|[\\/])test_dir\.txt$/i,
  /(^|[\\/])\.env(\.|$)/i,
];

const GITIGNORE_BLOCK = `
# --- No publicar: documentos personales y temporales ---
/memory/
/temp/
/belkafut/
gob_*.html
sunat_*.html
or_*.html
pa_pl_*.html
paginas_amarillas_*.html
r_*.htm
rer*.html
temp-*.js
scrape-canales.js
update-canales.yml
test_dir.txt
.env
.env.*
`;

// ---------- utilidades ----------
const args = process.argv.slice(2);
const hasFlag = (...names) => names.some((n) => args.includes(n));
const flagValue = (...names) => {
  for (const n of names) {
    const i = args.indexOf(n);
    if (i !== -1) {
      const v = args[i + 1];
      if (v && !v.startsWith("-")) return v;
    }
  }
  return null;
};

const DRY = hasFlag("--dry-run", "-n");
const WATCH = hasFlag("--watch");
const YES = hasFlag("--yes", "-y");
const SYNC_MASTER = hasFlag("--sync-master");
const MESSAGE = flagValue("--message", "-m");

const C = process.stdout.isTTY
  ? { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", b: "\x1b[36m", d: "\x1b[2m", x: "\x1b[0m" }
  : { g: "", r: "", y: "", b: "", d: "", x: "" };

const ok = (m) => console.log(`${C.g}  ok${C.x} ${m}`);
const warn = (m) => console.log(`${C.y}  !${C.x} ${m}`);
const bad = (m) => console.log(`${C.r}  x${C.x} ${m}`);
const info = (m) => console.log(`${C.d}    ${m}${C.x}`);

function die(message, hints = []) {
  console.error(`\n${C.r}No se publicó nada.${C.x} ${message}`);
  for (const h of hints) console.error(`  ${h}`);
  process.exit(1);
}

function git(gitArgs, { check = false, quiet = true } = {}) {
  const res = spawnSync("git", gitArgs, {
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (check && res.status !== 0) {
    die(`falló: git ${gitArgs.join(" ")}`, [res.stderr?.trim() || ""].filter(Boolean));
  }
  return { status: res.status, out: (res.stdout || "").trim(), err: (res.stderr || "").trim() };
}

const gitOut = (gitArgs) => git(gitArgs).out;

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || "").trim().toLowerCase());
    });
  });
}

// ---------- 1. comprobaciones del entorno ----------
const probe = spawnSync("git", ["--version"], { encoding: "utf8" });
if (probe.status !== 0) {
  die("Git no está instalado o no está en el PATH.", [
    "Instálalo desde https://git-scm.com/download/win y vuelve a abrir la terminal.",
  ]);
}

const toplevel = gitOut(["rev-parse", "--show-toplevel"]);
if (!toplevel) die("esta carpeta no es un repositorio git.", ["Abre la terminal dentro de la carpeta del proyecto."]);
process.chdir(toplevel);
console.log(`\n${C.b}Pelis — publicar cambios${C.x}`);
info(`repositorio: ${toplevel}`);

if (gitOut(["remote"]).split("\n").map((s) => s.trim()).filter(Boolean).includes(REMOTE) === false) {
  die(`no existe el remoto "${REMOTE}".`, ["Añádelo con: git remote add origin <url-del-repo>"]);
}

const remoteUrl = gitOut(["remote", "get-url", REMOTE]);
info(`remoto: ${remoteUrl}`);
if (remoteUrl && /github\.com[:/]youcefyakhoo\/pelis(\.git)?$/i.test(remoteUrl) === false) {
  warn(`el remoto no parece ser youcefyakhoo/pelis: ${remoteUrl}`);
}

if (!gitOut(["config", "user.email"])) {
  die("git no sabe quién eres (falta user.email).", [
    'Ejecuta una vez:  git config --global user.name "Tu Nombre"',
    '                  git config --global user.email "tu@correo.com"',
  ]);
}

// ---------- 2. proteger ficheros personales ----------
const gitignorePath = join(toplevel, ".gitignore");
const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
if (!gitignore.includes("No publicar: documentos personales")) {
  appendFileSync(gitignorePath, GITIGNORE_BLOCK);
  ok("añadidas reglas a .gitignore para no publicar documentos personales");
}

// ---------- 3. rama correcta ----------
let branch = gitOut(["rev-parse", "--abbrev-ref", "HEAD"]);

if (branch !== BRANCH) {
  const dirty = gitOut(["status", "--porcelain"]) !== "";
  const label = branch === "HEAD" ? "HEAD separado" : `"${branch}"`;
  warn(`estás en ${label}; la web se publica desde "${BRANCH}"`);

  // Los cambios sin guardar se llevan solos a la rama correcta.
  let stashed = false;
  if (dirty) {
    const stash = git(["stash", "push", "-u", "-m", "publish: cambios pendientes"]);
    if (stash.status !== 0) {
      die("no se pudieron apartar tus cambios.", [stash.err || "revisa `git status`"]);
    }
    stashed = true;
    ok("cambios apartados temporalmente");
  }

  if (branch === "HEAD") {
    git(["switch", BRANCH], { check: true });
  } else if (git(["rev-parse", "--verify", "--quiet", BRANCH]).status === 0) {
    git(["switch", BRANCH], { check: true });
  } else {
    git(["switch", "-c", BRANCH, `${REMOTE}/${BRANCH}`], { check: true });
  }
  ok(`cambiada la rama local a "${BRANCH}"`);

  if (stashed) {
    const pop = git(["stash", "pop"]);
    if (pop.status !== 0) {
      die("al pasar los cambios a \"main\" hubo un conflicto.", [
        "Tus cambios NO se han perdido: están guardados.",
        "Resuélvelo con:  git status",
        "Cuando termines: git add -A && git stash drop",
      ]);
    }
    ok("cambios traídos a \"main\"");
  }
  branch = BRANCH;
}

// ---------- 4. sincronizar con el remoto ----------
console.log("");
const fetched = git(["fetch", REMOTE, BRANCH]);
if (fetched.status !== 0) {
  die(`no se pudo conectar con ${REMOTE}.`, [
    "Comprueba tu conexión y que tengas permisos de escritura en el repo.",
    `Detalle: ${fetched.err.split("\n")[0] || "sin detalle"}`,
  ]);
}

const ahead = Number(gitOut(["rev-list", "--count", `${REMOTE}/${BRANCH}..HEAD`]) || 0);
const behind = Number(gitOut(["rev-list", "--count", `HEAD..${REMOTE}/${BRANCH}`]) || 0);

if (ahead > 0 && behind > 0) {
  die(`tu copia y ${REMOTE}/${BRANCH} han divergido (${ahead} tuyos, ${behind} remotos).`, [
    "Elige una:",
    `  git pull --rebase ${REMOTE} ${BRANCH}   (conserva tus commits encima de los remotos)`,
    `  git reset --hard ${REMOTE}/${BRANCH}    (descarta tus commits locales)`,
    "Después vuelve a ejecutar este script.",
  ]);
}
if (behind > 0) {
  const pull = git(["merge", "--ff-only", `${REMOTE}/${BRANCH}`]);
  if (pull.status !== 0) die("no se pudo actualizar tu copia con el remoto.", [pull.err]);
  ok(`actualizado con ${behind} commit(s) nuevos de ${REMOTE}/${BRANCH}`);
}
if (ahead > 0) info(`tienes ${ahead} commit(s) local(es) pendientes de subir`);

// ---------- 5. qué se va a subir ----------
const untracked = gitOut(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
const personal = untracked.filter((f) => PERSONAL.some((re) => re.test(f)) || PERSONAL.some((re) => re.test(`/${f}`)));
if (personal.length) {
  warn(`${personal.length} fichero(s) personal(es) NO se publicarán:`);
  personal.slice(0, 6).forEach((f) => info(f));
  if (personal.length > 6) info(`… y ${personal.length - 6} más`);
}

const add = git(["add", "-A"]);
if (add.status !== 0) die("no se pudieron preparar los cambios.", [add.err]);

const stagedRaw = gitOut(["diff", "--cached", "--name-status"]);
const staged = stagedRaw ? stagedRaw.split("\n").filter(Boolean) : [];
const leaks = staged.filter((line) => {
  const file = line.split(/\s+/).pop() || "";
  return PERSONAL.some((re) => re.test(file) || re.test(`/${file}`));
});
if (leaks.length) {
  git(["reset", "-q"]);
  die("se iban a publicar ficheros personales; se canceló.", [
    ...leaks.slice(0, 5).map((l) => l),
    "Añádelos a .gitignore y vuelve a intentarlo.",
  ]);
}

const big = staged
  .map((line) => line.split(/\s+/).pop())
  .filter((f) => f && existsSync(f) && statSync(f).isFile())
  .map((f) => ({ f, mb: statSync(f).size / 1024 / 1024 }))
  .filter((x) => x.mb >= BIG_FILE_MB);

if (big.length) {
  warn(`hay ${big.length} fichero(s) grandes:`);
  big.slice(0, 5).forEach((b) => info(`${b.f} — ${b.mb.toFixed(1)} MB`));
  const tooBig = big.filter((b) => b.mb >= MAX_FILE_MB);
  if (tooBig.length) {
    die(`GitHub rechaza ficheros de más de 100 MB (aviso a partir de ${MAX_FILE_MB} MB).`, [
      ...tooBig.map((b) => `${b.f} — ${b.mb.toFixed(1)} MB`),
      "Muévelos fuera del repo o usa Git LFS.",
    ]);
  }
}

if (!staged.length) {
  console.log("");
  ok("no hay nada nuevo que publicar: la web ya está al día");
  if (ahead > 0) {
    warn(`pero tienes ${ahead} commit(s) locales sin subir; se subirán`);
  } else {
    process.exit(0);
  }
} else {
  const counts = staged.reduce((acc, line) => {
    const k = line[0];
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const summary = [
    counts.A && `${counts.A} nuevo(s)`,
    counts.M && `${counts.M} modificado(s)`,
    counts.D && `${counts.D} borrado(s)`,
  ].filter(Boolean).join(", ");
  console.log("");
  ok(`${staged.length} fichero(s) a publicar: ${summary}`);
  staged.slice(0, 12).forEach((l) => info(l));
  if (staged.length > 12) info(`… y ${staged.length - 12} más`);
}

// ---------- 6. confirmar ----------
const commitMessage = MESSAGE || `chore: publicar cambios desde el PC (${new Date().toISOString().slice(0, 16).replace("T", " ")})`;

if (DRY) {
  git(["reset", "-q"]); // no dejar cambios preparados en el índice
  console.log("");
  warn("modo --dry-run: no se ha hecho commit ni push");
  info(`se habría usado el mensaje: ${commitMessage}`);
  process.exit(0);
}

if (!YES) {
  const answer = await ask(`\n¿Publicar en ${REMOTE}/${BRANCH}? [s/N] `);
  if (!["s", "si", "sí", "y", "yes"].includes(answer)) {
    git(["reset", "-q"]);
    console.log("Cancelado. No se publicó nada.");
    process.exit(0);
  }
}

// ---------- 7. commit + push ----------
if (staged.length) {
  const commit = git(["commit", "-m", commitMessage]);
  if (commit.status !== 0 && !/nothing to commit/i.test(commit.out + commit.err)) {
    die("el commit falló.", [commit.err || commit.out]);
  }
  ok(`commit creado: ${gitOut(["log", "-1", "--format=%h %s"])}`);
}

console.log("");
console.log("Subiendo…");
const push = spawnSync("git", ["push", REMOTE, `HEAD:${BRANCH}`], { stdio: "inherit" });
if (push.status !== 0) {
  die("el push falló.", [
    "Si es un error de autenticación, configura una credencial de GitHub:",
    "  gh auth login     (o usa Git Credential Manager al hacer push)",
  ]);
}
ok(`subido a ${REMOTE}/${BRANCH}`);

if (SYNC_MASTER) {
  const m = spawnSync("git", ["push", REMOTE, `HEAD:master`], { stdio: "inherit" });
  if (m.status === 0) ok("master también actualizado");
  else warn("no se pudo actualizar master (¿tiene commits propios?)");
}

// ---------- 8. resumen ----------
const sha = gitOut(["rev-parse", "--short", "HEAD"]);
const remoteSha = (() => {
  const r = spawnSync("git", ["ls-remote", REMOTE, `refs/heads/${BRANCH}`], { encoding: "utf8" });
  return (r.stdout || "").split(/\s+/)[0]?.slice(0, 7) || "";
})();

console.log("");
console.log(`${C.b}Listo.${C.x} commit ${sha}${remoteSha ? ` (remoto: ${remoteSha})` : ""}`);
console.log("GitHub Pages tarda ~1 minuto en reconstruir. Comprueba:");
console.log(`  https://youcefyakhoo.github.io/pelis/`);

if (WATCH) {
  console.log("");
  console.log("Esperando al build de Pages…");
  const repo = "youcefyakhoo/pelis";
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    const res = spawnSync("gh", ["api", `repos/${repo}/pages/builds/latest`, "--jq", ".status + \" \" + .commit[0:7]"], {
      encoding: "utf8",
    });
    if (res.status !== 0) {
      warn("no se pudo consultar el build (¿gh sin autenticar?). Revisa la web en un minuto.");
      process.exit(0);
    }
    const [status, commit] = (res.stdout || "").trim().split(" ");
    info(`${status} ${commit || ""}`);
    if (commit && commit !== sha) continue; // build antiguo, seguimos esperando
    if (status === "built") {
      ok("publicado en la web");
      process.exit(0);
    }
    if (status === "errored") {
      die("el build de Pages falló.", ["Revisa Actions/Pages en GitHub."]);
    }
  }
  warn("el build tarda más de lo normal; revisa la web en unos minutos.");
}
