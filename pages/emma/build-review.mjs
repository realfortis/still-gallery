import { build } from 'esbuild';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { visitorPage } from './shell.mjs';

export async function buildReview(output, supabase) {
  const page = visitorPage({
    title: 'Gallery',
    css: 'review.css?v=public',
    script: 'review.js?v=public',
    supabase,
    hosted: true
  });
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(new URL('index.html', output), page),
    copyFile(new URL('legacy.css', import.meta.url), new URL('review.css', output)),
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
        EMMA_MODE: JSON.stringify('hosted'),
        EMMA_PREVIEW_PATHS: '{}',
        EMMA_LEGACY_PATHS: '[]'
      }
    })
  ]);
}
