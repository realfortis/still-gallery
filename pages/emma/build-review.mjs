import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { adminPage, visitorPage } from './shell.mjs';

export async function buildReview(output, supabase) {
  const script = new URL('review.js', output);
  const adminScript = new URL('admin.js', output);
  const css = new URL('legacy.css', import.meta.url);
  const revision = (content) => createHash('sha256').update(content).digest('hex').slice(0, 12);
  const compile = (entry, destination) => build({
    entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
    outfile: fileURLToPath(destination),
    write: false,
    bundle: true,
    minify: true,
    format: 'esm',
    legalComments: 'eof',
    target: ['es2022'],
    define: {
      EMMA_CONFIG: JSON.stringify(supabase),
      EMMA_MODE: JSON.stringify('hosted'),
      EMMA_PREVIEW_PATHS: '{}',
      EMMA_LEGACY_PATHS: '[]'
    }
  }).then(({ outputFiles }) => outputFiles[0].contents);

  const font = new URL('fonts/marcellus.woff2', import.meta.url);
  const [stylesheet, bundle, adminBundle, fontBytes, settings, background, logo] = await Promise.all([
    readFile(css),
    compile('visitor.mjs', script),
    compile('admin.mjs', adminScript),
    readFile(font),
    readFile(new URL('branding/settings.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('branding/background.webp', import.meta.url)),
    readFile(new URL('branding/logo.webp', import.meta.url))
  ]);
  const inlineStyle = stylesheet.toString('utf8').replace('./marcellus.woff2',
    'data:font/woff2;base64,' + fontBytes.toString('base64'));
  const embed = (file, bytes) => ({ file, src: 'data:image/webp;base64,' + bytes.toString('base64') });
  const page = visitorPage({
    title: settings.title,
    inlineStyle,
    branding: {
      address: settings.address,
      background: embed(settings.background, background),
      logo: embed(settings.logo, logo)
    },
    script: 'review.js?v=' + revision(bundle),
    supabase,
    hosted: true
  });
  const admin = adminPage({
    title: 'Emma Butler Gallery',
    css: '../site.css',
    script: 'admin.js?v=' + revision(adminBundle),
    supabase,
    hosted: true
  });
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(new URL('index.html', output), page),
    writeFile(new URL('review.css', output), stylesheet),
    writeFile(script, bundle),
    writeFile(new URL('admin.html', output), admin),
    writeFile(adminScript, adminBundle),
    copyFile(font, new URL('marcellus.woff2', output)),
    copyFile(new URL('fonts/OFL-Marcellus.txt', import.meta.url), new URL('OFL-Marcellus.txt', output))
  ]);
}
