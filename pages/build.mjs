import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { home, pagesDetail, pagesAdmin } from '../src/views.mjs';
import { catalogData, pagesLinks } from './catalog.mjs';
import { exampleWorks } from '../src/examples.mjs';
import { buildReview } from './emma/build-review.mjs';

const root = new URL('../', import.meta.url);
const docs = new URL('docs/', root);
const configPath = new URL('pages/config.json', root);
const writePage = (file, markup) => writeFile(new URL(file, docs), markup.replace(/[ \t]+$/gm, ''));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--backend')) {
  throw new Error('Usage: npm run pages:build [-- --backend https://gallery-api.example.com]');
}

const settings = JSON.parse(await readFile(configPath, 'utf8'));
const input = args[1] ?? settings.backendOrigin;
const backend = input ? new URL(input) : null;
if (backend && (backend.username || backend.password || backend.pathname !== '/' ||
    backend.search || backend.hash || (backend.protocol !== 'https:' &&
      !(backend.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(backend.hostname))))) {
  throw new Error('Use the HTTPS origin of the backend, without a path or credentials.');
}
const backendOrigin = backend?.origin || '';
const supabase = backendOrigin ? null : settings.supabase || null;
if (supabase && (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabase.url) ||
    !/^sb_publishable_[a-zA-Z0-9_-]+$/.test(supabase.publishableKey))) {
  throw new Error('Configure a Supabase project URL and a publishable key in pages/config.json.');
}
if (args.length) await writeFile(configPath, JSON.stringify({ ...settings, backendOrigin }, null, 2) + '\n');
const live = Boolean(backendOrigin || supabase);

await mkdir(new URL('artwork/', docs), { recursive: true });
await Promise.all([
  ...exampleWorks.map(({ file }) => copyFile(new URL(`artwork/${file}`, root), new URL(`artwork/${file}`, docs))),
  copyFile(new URL('public/site.css', root), new URL('site.css', docs)),
  copyFile(new URL('src/catalog-view.mjs', root), new URL('catalog-view.js', docs)),
  copyFile(new URL('pages/catalog.mjs', root), new URL('catalog.js', docs)),
  copyFile(new URL('pages/gallery.mjs', root), new URL('gallery.js', docs)),
  // Include demo records only when the site is explicitly in demo mode.
  live
    ? writeFile(new URL('examples.js', docs), 'export const exampleWorks = [];\n')
    : copyFile(new URL('src/examples.mjs', root), new URL('examples.js', docs)),
  writeFile(new URL('config.js', docs), `export const backendOrigin = ${JSON.stringify(backendOrigin)};\nexport const supabase = ${JSON.stringify(supabase)};\n`),
  writeFile(new URL('.nojekyll', docs), '')
]);

const pages = { staff: supabase ? './admin.html' : backendOrigin ? `${backendOrigin}/admin` : '' };
const adminFiles = ['admin.html', 'admin.js', 'admin-view.js', 'gallery-store.js', 'supabase-client.js'];
if (supabase) {
  await Promise.all([
    buildReview(new URL('review/', docs), supabase),
    writePage('admin.html', pagesAdmin(pages)),
    copyFile(new URL('pages/admin.mjs', root), new URL('admin.js', docs)),
    copyFile(new URL('pages/gallery-store.mjs', root), new URL('gallery-store.js', docs)),
    build({
      entryPoints: {
        'supabase-client': fileURLToPath(new URL('pages/supabase-client.mjs', root)),
        'admin-view': fileURLToPath(new URL('pages/admin-view.mjs', root))
      },
      outdir: fileURLToPath(docs),
      bundle: true,
      format: 'esm',
      minify: true,
      legalComments: 'eof',
      target: ['es2022']
    })
  ]);
} else {
  await Promise.all([
    ...adminFiles.map((file) => rm(new URL(file, docs), { force: true })),
    rm(new URL('review/', docs), { recursive: true, force: true })
  ]);
}
const demo = [...exampleWorks].sort((a, b) => b.featured - a.featured || b.id - a.id);
const catalog = catalogData(live ? [] : demo);
await Promise.all([
  writePage('index.html', home({
    ...catalog,
    links: pagesLinks(backendOrigin),
    clearFilters: './#collection',
    message: live ? 'Loading the collection…' : ''
  }, pages)),
  writePage('artwork.html', pagesDetail(pages))
]);
console.log(`Built docs/ in ${live ? 'live catalog' : 'demo'} mode.`);
