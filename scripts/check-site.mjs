#!/usr/bin/env node
/**
 * check-site.mjs — structural checks for a site with no build step.
 *
 * Nothing here compiles, so nothing catches a mistake for us: a page can drift
 * out of sync with the others, a new module can be left out of the offline
 * cache, or a link can point at a file that was renamed. This walks the actual
 * files and fails on the things that have no other safety net.
 *
 * Run with `npm test`. No dependencies — it only reads the repo.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

let failures = 0;
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);
const section = (name) => console.log(`\n${name}`);

/* ------------------------------------------------------------------ pages */
// Every module: its directory, the data-page value, and its nav label.
const MODULES = [
  { dir: "",       page: "gen",   nav: "Gen" },
  { dir: "delay",  page: "delay", nav: "Delay" },
  { dir: "db",     page: "db",    nav: "Level" },
  { dir: "rt60",   page: "rt60",  nav: "RT60" },
  { dir: "note",   page: "note",  nav: "Note" },
  { dir: "spl",    page: "spl",   nav: "SPL" },
  { dir: "math",   page: "math",  nav: "Math" },
  { dir: "about",  page: "about", nav: "About" },
];

const pageFile = (m) => (m.dir ? `${m.dir}/index.html` : "index.html");
const pageUrl  = (m) => (m.dir ? `/${m.dir}/` : "/");

section("Pages exist and are wired up");
for (const m of MODULES) {
  const f = pageFile(m);
  if (!existsSync(join(ROOT, f))) { fail(`missing page ${f}`); continue; }
  const html = read(f);

  if (!html.includes(`data-page="${m.page}"`)) {
    fail(`${f}: <body> is missing data-page="${m.page}"`);
  }
  // Every page must link to every module, or the nav silently loses an entry.
  for (const other of MODULES) {
    if (!html.includes(`href="${pageUrl(other)}" data-nav="${other.page}"`)) {
      fail(`${f}: nav is missing the ${other.nav} link`);
    }
  }
  if (!html.includes(`<link rel="canonical" href="https://1khz.sh${pageUrl(m)}">`)) {
    fail(`${f}: missing or wrong rel=canonical (needed — every subdomain serves this page)`);
  }
  for (const tag of ["og:title", "og:description", "og:url", "og:image"]) {
    if (!html.includes(`property="${tag}"`)) fail(`${f}: missing ${tag}`);
  }
  // A share card only renders large if the card is declared large *and* the
  // image it points at was actually generated (`npm run og`).
  if (!html.includes('content="summary_large_image"')) {
    fail(`${f}: twitter:card should be summary_large_image (there is an og:image)`);
  }
  const ogImage = html.match(/property="og:image" content="https:\/\/1khz\.sh(\/assets\/og\/[^"]+)"/)?.[1];
  if (!ogImage) fail(`${f}: og:image is not an absolute https://1khz.sh URL`);
  else if (!existsSync(join(ROOT, ogImage))) {
    fail(`${f}: og:image points at ${ogImage}, which does not exist — run \`npm run og\``);
  }
  if (!html.includes("/assets/js/panel-common.js")) {
    fail(`${f}: does not load panel-common.js`);
  }
  if (!html.includes('data-site="source"')) {
    fail(`${f}: footer is missing the source link`);
  }
}
if (!failures) pass(`all ${MODULES.length} pages present, linked, and tagged`);

/* --------------------------------------------------------------------- seo */
// Search engines show the <title> and the description, and nothing on this
// site regenerates them — so a duplicated or overlong one would ship unnoticed.
section("Titles, descriptions, and structured data");
{
  const before = failures;
  const seen = { title: new Map(), desc: new Map() };
  // Enough to measure length honestly; these pages use a handful of entities.
  const text = (s) => s
    .replace(/&mdash;/g, "\u2014").replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ").replace(/&[a-z]+;/g, "?");

  for (const m of MODULES) {
    const f = pageFile(m);
    if (!existsSync(join(ROOT, f))) continue;
    const html = read(f);

    const title = text(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
    const desc = text(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");

    if (!title) fail(`${f}: no <title>`);
    // Google truncates the title around 60 characters and the description
    // around 160; past that the tail is written for nobody.
    else if (title.length > 65) fail(`${f}: title is ${title.length} chars (keep it under ~60)`);
    if (!desc) fail(`${f}: no meta description`);
    else if (desc.length < 70 || desc.length > 165) {
      fail(`${f}: description is ${desc.length} chars (aim for 120-160)`);
    }

    // Two pages sharing either one means one of them is invisible.
    for (const [key, value] of [["title", title], ["desc", desc]]) {
      const prev = seen[key].get(value);
      if (value && prev) fail(`${f}: ${key} is identical to ${prev}`);
      seen[key].set(value, f);
    }

    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    if (!ld) fail(`${f}: no JSON-LD block`);
    else {
      try {
        const data = JSON.parse(ld);
        const graph = data["@graph"] ?? [data];
        // Every URL in the graph has to be the canonical apex one, or the
        // structured data describes a subdomain that shouldn't be indexed.
        const urls = JSON.stringify(graph).match(/"https?:\/\/[^"]+"/g) ?? [];
        for (const u of urls) {
          if (u.includes("1khz.sh") && !u.startsWith('"https://1khz.sh')) {
            fail(`${f}: JSON-LD contains a non-canonical 1khz.sh URL ${u}`);
          }
        }
        if (!graph.some((n) => n["@type"])) fail(`${f}: JSON-LD has no @type`);
      } catch (e) {
        fail(`${f}: JSON-LD does not parse — ${e.message}`);
      }
    }
  }

  // The 404 is reachable from every wrong URL on every subdomain; it must
  // never be a candidate for indexing.
  if (!read("404.html").includes('name="robots" content="noindex"')) {
    fail("404.html: missing <meta name=robots content=noindex>");
  }

  if (failures === before) pass("titles and descriptions are unique and sized, JSON-LD parses");
}

/* -------------------------------------------------------- offline caching */
section("Service worker precaches the whole site");
{
  const sw = read("sw.js");
  const before = failures;

  for (const m of MODULES) {
    if (!sw.includes(`"${pageUrl(m)}"`)) fail(`sw.js PRECACHE is missing ${pageUrl(m)}`);
  }
  // Every JS module and font must be cached, or the site half-works offline.
  for (const js of readdirSync(join(ROOT, "assets/js"))) {
    if (js.endsWith(".js") && !sw.includes(`/assets/js/${js}`)) {
      fail(`sw.js PRECACHE is missing /assets/js/${js}`);
    }
  }
  for (const font of readdirSync(join(ROOT, "assets/fonts"))) {
    if (font.endsWith(".woff2") && !sw.includes(`/assets/fonts/${font}`)) {
      fail(`sw.js PRECACHE is missing /assets/fonts/${font}`);
    }
  }
  if (failures === before) pass("every page, module, and font is precached");
}

/* ---------------------------------------------------------------- sitemap */
section("Sitemap matches the pages");
{
  const sitemap = read("sitemap.xml");
  const before = failures;
  for (const m of MODULES) {
    if (!sitemap.includes(`https://1khz.sh${pageUrl(m)}<`)) {
      fail(`sitemap.xml is missing https://1khz.sh${pageUrl(m)}`);
    }
  }
  // lastmod is generated from git by `npm run sitemap`; a <url> without one
  // means the file was hand-edited and has started drifting.
  const urls = sitemap.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  for (const u of urls) {
    if (!/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(u)) {
      const loc = u.match(/<loc>([^<]*)<\/loc>/)?.[1] ?? "?";
      fail(`sitemap.xml: ${loc} has no valid <lastmod> — run \`npm run sitemap\``);
    }
  }
  if (failures === before) pass(`every page is listed, all ${urls.length} with a lastmod`);
}

/* ------------------------------------------------------------ dead links */
section("Internal links resolve");
{
  const before = failures;
  const htmlFiles = [...MODULES.map(pageFile), "404.html"];
  for (const f of htmlFiles) {
    const html = read(f);
    // Root-relative hrefs and srcs only — external URLs are not our problem.
    for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
      const target = url.endsWith("/") ? join(url, "index.html") : url;
      if (!existsSync(join(ROOT, target))) fail(`${f}: link to ${url} has no file`);
    }
  }
  if (failures === before) pass("no dead internal links");
}

/* ---------------------------------------------------------- placeholders */
section("No placeholders shipped");
{
  const before = failures;
  const banned = ["YOUR-USER", "YOUR-HANDLE", "AFFILIATE-URL", "example.com"];
  const walk = (dir) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      if ([".git", "node_modules", ".idea", ".github"].includes(name)) continue;
      const rel = join(dir, name);
      if (statSync(join(ROOT, rel)).isDirectory()) { walk(rel); continue; }
      if (!/\.(html|js|css|json|webmanifest|xml|txt)$/.test(name)) continue;
      const body = read(rel);
      for (const b of banned) {
        if (body.includes(b)) fail(`${rel}: contains placeholder "${b}"`);
      }
    }
  };
  walk(".");
  if (failures === before) pass("no placeholder URLs or handles");
}

/* ------------------------------------------------- config sanity (links) */
section("Project links are usable");
{
  const before = failures;
  const cfg = read("assets/js/config.js");
  const source = cfg.match(/sourceUrl:\s*"([^"]*)"/)?.[1];
  const donate = cfg.match(/donateUrl:\s*"([^"]*)"/)?.[1];
  if (!source?.startsWith("https://")) {
    fail("config.js: sourceUrl must be a real https URL");
  }
  // An empty donate URL is fine and hides the button; a broken one is not.
  if (donate !== "" && !donate?.startsWith("https://")) {
    fail('config.js: donateUrl must be an https URL or "" to hide the button');
  }
  if (failures === before) pass("source and donate links are valid");
}

/* -------------------------------------------------------------------- end */
console.log("");
if (failures) {
  console.error(`FAILED — ${failures} problem${failures === 1 ? "" : "s"}\n`);
  process.exit(1);
}
console.log("All checks passed.\n");
