import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { visitorPage } from './shell.mjs';

export async function buildReview(output, supabase) {
  const script = new URL('review.js', output);
  const css = new URL('legacy.css', import.meta.url);
  const revision = (content) => createHash('sha256').update(content).digest('hex').slice(0, 12);
  const [stylesheet, bundle] = await Promise.all([
    readFile(css),
    build({
      entryPoints: [fileURLToPath(new URL('visitor.mjs', import.meta.url))],
      outfile: fileURLToPath(script),
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
    }).then(({ outputFiles }) => outputFiles[0].contents)
  ]);
  const page = visitorPage({
    title: 'Gallery',
    css: 'review.css?v=' + revision(stylesheet),
    script: 'review.js?v=' + revision(bundle),
    supabase,
    hosted: true
  });
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(new URL('index.html', output), page),
    writeFile(new URL('review.css', output), stylesheet),
    writeFile(script, bundle),
    copyFile(new URL('fonts/marcellus.woff2', import.meta.url), new URL('marcellus.woff2', output)),
    copyFile(new URL('fonts/OFL-Marcellus.txt', import.meta.url), new URL('OFL-Marcellus.txt', output))
  ]);
}
