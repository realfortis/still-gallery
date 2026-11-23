import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { visitorPage } from './shell.mjs';

export async function buildReview(output, supabase) {
  const page = visitorPage({
    title: 'Private site review',
    css: 'review.css',
    script: 'review.js',
    supabase,
    review: true
  });
  const [galleryCss, reviewCss] = await Promise.all([
    readFile(new URL('legacy.css', import.meta.url), 'utf8'),
    readFile(new URL('review.css', import.meta.url), 'utf8')
  ]);
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(new URL('index.html', output), page),
    writeFile(new URL('review.css', output), galleryCss + '\n' + reviewCss),
    copyFile(new URL('fonts/marcellus.woff2', import.meta.url), new URL('marcellus.woff2', output)),
    copyFile(new URL('fonts/OFL-Marcellus.txt', import.meta.url), new URL('OFL-Marcellus.txt', output)),
    build({
      entryPoints: [fileURLToPath(new URL('visitor.mjs', import.meta.url))],
      outfile: fileURLToPath(new URL('review.js', output)),
      bundle: true,
      minify: true,
      format: 'esm',
      legalComments: 'eof',
      target: ['es2022'],
      define: {
        EMMA_CONFIG: JSON.stringify(supabase),
        EMMA_MODE: JSON.stringify('review'),
        EMMA_PREVIEW_PATHS: '{}',
        EMMA_LEGACY_PATHS: '[]'
      }
    })
  ]);
}
