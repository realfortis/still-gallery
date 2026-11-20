import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const approve = args[0] === '--approve-reviewed';
const [manifestArg, suppliedEmail] = approve ? args.slice(1) : args;
if (!manifestArg || !process.stdin.isTTY) {
  console.error('In a private terminal, run: npm run emma:import -- /path/to/preview.json');
  process.exit(1);
}
const path = resolve(manifestArg);
const snapshot = JSON.parse(await readFile(path, 'utf8'));
const { supabase } = JSON.parse(await readFile(new URL('../../pages/config.json', import.meta.url), 'utf8'));
const client = createClient(supabase.url, supabase.publishableKey, {
  auth: { persistSession: false, autoRefreshToken: true }
});

async function login() {
  let email = suppliedEmail;
  if (!email) {
    const visible = createInterface({ input: process.stdin, output: process.stdout });
    try { email = (await visible.question('Existing gallery staff email: ')).trim(); }
    finally { visible.close(); }
  }
  const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const hidden = createInterface({ input: process.stdin, output: silent, terminal: true });
  hidden.on('SIGINT', () => process.exit(130));
  try {
    process.stdout.write('Staff password: ');
    const password = await hidden.question('');
    process.stdout.write('\n');
    const attempt = await client.auth.signInWithPassword({ email, password });
    if (attempt.error) throw new Error('Staff sign-in failed.');
    const staff = await client.rpc('is_gallery_staff');
    if (staff.error || !staff.data) throw new Error('This account has no staff access.');
  } finally { hidden.close(); }
}

function check({ data, error }, message) {
  if (error) throw new Error(`${message}: ${error.message}`);
  return data;
}

async function chunks(values, run) {
  for (let index = 0; index < values.length; index += 100) await run(values.slice(index, index + 100));
}

async function importSnapshot() {
  const selected = snapshot.assets.filter((image) => image.detail && image.thumb && !image.error);
  const available = new Set(selected.map((image) => image.id));
  let bytes = 0;
  for (const image of selected) {
    const [detail, thumb] = [image.id + '.webp', image.id + '-thumb.webp'];
    if (!/^[a-f0-9-]{36}$/.test(image.id) || image.detail !== detail || image.thumb !== thumb) {
      throw new Error('Invalid image path in manifest.');
    }
    bytes += (await stat(join(dirname(path), 'media', detail))).size + (await stat(join(dirname(path), 'media', thumb))).size;
  }

  const previous = check(await client.from('emma_settings').select('published').maybeSingle(), 'Gallery tables are unavailable');
  if (previous?.published) throw new Error('The client gallery is already public. Use the staff portal for further edits.');
  console.log(`Importing ${selected.length} image pairs (${Math.round(bytes / 1e6)} MB), all as staff-only drafts.`);
  const bucket = client.storage.from('emma-gallery');
  for (let index = 0; index < selected.length; index += 4) {
    const batch = selected.slice(index, index + 4);
    await Promise.all(batch.map(async (image) => {
      for (const name of [image.detail, image.thumb]) {
        const bytes = await readFile(join(dirname(path), 'media', name));
        const result = await bucket.upload(name, bytes, { contentType: 'image/webp', cacheControl: '60' });
        if (result.error && !(result.error.statusCode === '409' || result.error.error === 'Duplicate')) {
          check(result, `Could not upload ${name}`);
        }
      }
    }));
    check(await client.from('emma_assets').upsert(batch.map((image) => ({
      id: image.id, detail: image.detail, thumbnail: image.thumb, site_media: image.kind === 'site', approved: false
    })), { onConflict: 'id', ignoreDuplicates: true }), 'Could not register image batch');
    if (!(index % 100)) console.log(`Uploaded ${Math.min(index + batch.length, selected.length)}/${selected.length} image pairs.`);
  }

  const works = snapshot.artworks.filter((work) => available.has(work.asset_id)).map(({ sources, ...work }) =>
    ({ ...work, edited: false, published: false }));
  await chunks(works, async (batch) => check(await client.from('emma_artworks')
    .upsert(batch, { onConflict: 'id', ignoreDuplicates: true }), 'Could not stage artwork'));
  await chunks(snapshot.pages, async (batch) => check(await client.from('emma_pages')
    .upsert(batch.map((page) => ({ ...page, published: false })), { onConflict: 'route', ignoreDuplicates: true }), 'Could not stage pages'));
  const settings = { ...snapshot.settings, published: false, id: true };
  for (const key of ['logo', 'background']) if (!available.has(settings[key])) settings[key] = null;
  check(await client.from('emma_settings').upsert(settings, { onConflict: 'id', ignoreDuplicates: true }),
    'Could not stage gallery settings');
  console.log(`Staged ${works.length} artwork records and ${snapshot.pages.length} pages for staff review.`);
}

try {
  await login();
  if (approve) {
    if (!Array.isArray(snapshot.pages) || !snapshot.pages.includes('index.html') ||
        !Array.isArray(snapshot.artwork_ids) || !Array.isArray(snapshot.site_image_ids)) {
      throw new Error('Use a reviewed manifest listing pages, artwork_ids and site_image_ids.');
    }
    check(await client.rpc('emma_prepare_release', {
      routes: snapshot.pages, artwork_ids: snapshot.artwork_ids, site_image_ids: snapshot.site_image_ids
    }), 'Could not prepare the reviewed release');
    console.log('Approved records are ready. The gallery is still private until public availability is enabled.');
  } else {
    await importSnapshot();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.auth.signOut({ scope: 'local' }).catch(() => {});
  await client.auth.stopAutoRefresh();
}
