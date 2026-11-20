import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';
import { check, stageSnapshot } from '../../pages/emma/staging.mjs';

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
    const result = await stageSnapshot(client, snapshot, {
      readImage: (name) => readFile(join(dirname(path), 'media', name)),
      notify: (message) => console.log(message)
    });
    console.log(result);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.auth.signOut({ scope: 'local' }).catch(() => {});
  await client.auth.stopAutoRefresh();
}
