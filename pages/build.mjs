import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { home, pagesDetail } from '../src/views.mjs';
import { catalogData, pagesLinks } from './catalog.mjs';
import { exampleWorks } from '../src/examples.mjs';

const root = new URL('../', import.meta.url);
const docs = new URL('docs/', root);
const configPath = new URL('pages/config.json', root);
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
if (args.length) await writeFile(configPath, JSON.stringify({ backendOrigin }, null, 2) + '\n');

await mkdir(new URL('artwork/', docs), { recursive: true });
await Promise.all([
  ...exampleWorks.map(({ file }) => copyFile(new URL(`artwork/${file}`, root), new URL(`artwork/${file}`, docs))),
  copyFile(new URL('public/site.css', root), new URL('site.css', docs)),
  copyFile(new URL('src/catalog-view.mjs', root), new URL('catalog-view.js', docs)),
  copyFile(new URL('pages/catalog.mjs', root), new URL('catalog.js', docs)),
  copyFile(new URL('pages/gallery.mjs', root), new URL('gallery.js', docs)),
  // Include demo records only when the site is explicitly in demo mode.
  backendOrigin
    ? writeFile(new URL('examples.js', docs), 'export const exampleWorks = [];\n')
    : copyFile(new URL('src/examples.mjs', root), new URL('examples.js', docs)),
  writeFile(new URL('config.js', docs), `export const backendOrigin = ${JSON.stringify(backendOrigin)};\n`),
  writeFile(new URL('.nojekyll', docs), '')
]);

const pages = { staff: backendOrigin ? `${backendOrigin}/admin` : '' };
const demo = [...exampleWorks].sort((a, b) => b.featured - a.featured || b.id - a.id);
const catalog = catalogData(backendOrigin ? [] : demo);
await Promise.all([
  writeFile(new URL('index.html', docs), home({
    ...catalog,
    links: pagesLinks(backendOrigin),
    clearFilters: './#collection',
    message: backendOrigin ? 'Loading the collection…' : ''
  }, pages)),
  writeFile(new URL('artwork.html', docs), pagesDetail(pages))
]);
console.log(`Built docs/ in ${backendOrigin ? 'live catalog' : 'demo'} mode.`);
