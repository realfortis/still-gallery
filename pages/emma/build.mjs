import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [mode, manifestArg, outputArg] = process.argv.slice(2);
if (!['local', 'release'].includes(mode) || !manifestArg || !outputArg) {
  throw new Error('Usage: npm run emma:build -- local|release PATH_TO_PREVIEW_JSON OUTPUT_DIRECTORY');
}
const manifest = resolve(manifestArg);
const output = resolve(outputArg);
const snapshot = JSON.parse(await readFile(manifest, 'utf8'));
const { supabase } = JSON.parse(await readFile(join(root, 'pages/config.json'), 'utf8'));
if (!supabase) throw new Error('The existing Supabase project must be configured.');
const legacy = [...new Set(snapshot.pages.map(({ route }) => route))];
if (!legacy.includes('index.html') || legacy.some((route) => !/^[A-Za-z0-9_.-]+\.html?$/.test(route))) {
  throw new Error('The manifest contains an invalid page route.');
}
if (mode === 'release' && (output === join(root, 'docs') || output === resolve(manifest, '..'))) {
  throw new Error('Build the release in a clean review directory before publishing to docs/.');
}
if (mode === 'release' && process.platform === 'darwin' &&
    new Set(legacy.map((route) => route.toLowerCase())).size !== legacy.length) {
  throw new Error('Build the release on a case-sensitive Linux filesystem to preserve legacy URLs that differ only by case.');
}
await mkdir(output, { recursive: true });
const policy = [
  "default-src 'none'", "script-src 'self'", "style-src 'self' https://use.typekit.net https://p.typekit.net",
  "font-src https://use.typekit.net", `img-src 'self' blob: ${supabase.url} https://p.typekit.net`,
  `connect-src 'self' ${supabase.url}`, "base-uri 'none'", "form-action 'none'"
].join('; ');

const head = (title, css, script) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<title>${title}</title><link rel="stylesheet" href="./${css}">
<script type="module" src="./${script}"></script>
</head>`;

const menu = [
  ['Home', 'index.html'], ['About', 'about.htm'], ['Exhibitions', 'exhibitions.htm'],
  ['Services', 'services.htm'], ['Contact', 'contact.htm']
].map(([label, route]) => `<a href="./${route}" data-route="${route}">${label}</a>`).join(' <span aria-hidden="true">|</span> ');
const visitor = `${head('Emma Butler Gallery', 'emma.css', 'emma.js')}
<body><img id="gallery-background" alt="">
<header class="masthead"><div class="masthead-in">
<p class="address"></p><a class="brand" href="./index.html" data-route="index.html">Emma Butler Gallery</a>
<nav class="menu" aria-label="Main">${menu}</nav>
</div></header>
<div class="layout">
<aside class="artists"><img alt="Emma Butler Gallery"><details open><summary>Artists</summary><nav aria-label="Artists"></nav></details></aside>
<main class="content" id="main"><p role="status">Loading gallery…</p></main>
</div>
<footer><a href="./admin.html">Staff sign-in</a></footer>
<dialog class="lightbox" aria-label="Artwork viewer">
<img alt="" hidden><p data-image-status role="status"></p><p data-caption></p>
<nav aria-label="Artwork lightbox"><button type="button" data-prev>Previous</button><button type="button" data-next>Next</button>
<span data-count aria-live="polite"></span><button type="button" data-close autofocus>Close</button></nav>
</dialog></body></html>\n`;

const admin = `${head('Staff sign-in · Emma Butler Gallery', 'site.css', 'emma-admin.js')}
<body><header class="top"><div class="wrap top-inner">
<a class="brand" href="./index.html">Emma Butler Gallery</a></div></header>
<main id="main" class="wrap admin"><p role="status">Loading staff portal…</p></main></body></html>\n`;

const paths = [...legacy, 'entry.html'];
await Promise.all([
  ...paths.map((route) => writeFile(join(output, route), visitor)),
  writeFile(join(output, 'admin.html'), admin),
  writeFile(join(output, '.nojekyll'), ''),
  copyFile(join(root, 'pages/emma/legacy.css'), join(output, 'emma.css')),
  copyFile(join(root, 'public/site.css'), join(output, 'site.css')),
  build({
    entryPoints: {
      'emma': join(root, 'pages/emma/visitor.mjs'),
      'emma-admin': join(root, 'pages/emma/admin.mjs')
    },
    bundle: true, splitting: true, format: 'esm', minify: true, legalComments: 'eof',
    outdir: output, target: ['es2022'],
    define: {
      EMMA_CONFIG: JSON.stringify(supabase),
      EMMA_MODE: JSON.stringify(mode),
      EMMA_LEGACY_PATHS: JSON.stringify(legacy)
    }
  })
]);
if (mode === 'local' && basename(manifest) === 'preview.json' && join(output, 'preview.json') !== manifest) {
  throw new Error('Use the private snapshot directory as the local output so images resolve.');
}
console.log(`Built ${paths.length} gallery routes and the staff portal in ${output}.`);
