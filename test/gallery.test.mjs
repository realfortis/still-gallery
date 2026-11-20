import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('staff can publish and manage persistent artwork while drafts stay private', { timeout: 20000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sill-gallery-'));
  const env = {
    ...process.env,
    DATA_DIR: directory,
    HOST: '127.0.0.1',
    PORT: '0',
    NODE_ENV: 'test',
    PUBLIC_ORIGIN: '',
    RENDER_EXTERNAL_URL: '',
    PAGES_ORIGIN: 'https://gallery.example.test'
  };
  let server;
  t.after(async () => {
    if (server?.exitCode === null && server.signalCode === null) {
      server.kill();
      await once(server, 'exit');
    }
    await rm(directory, { recursive: true, force: true });
  });

  const email = 'staff@example.test';
  const password = randomBytes(24).toString('hex');
  const initial = spawnSync(process.execPath, ['src/admin.mjs', email], { env, input: password + '\n' });
  assert.equal(initial.status, 0, initial.stderr.toString());
  const seed = spawnSync(process.execPath, ['src/seed.mjs'], { env });
  assert.equal(seed.status, 0, seed.stderr.toString());

  async function start() {
    server = spawn(process.execPath, ['src/server.mjs'], { env });
    let errors = '';
    server.stderr.on('data', (chunk) => { errors += chunk; });
    const first = await Promise.race([
      once(server.stdout, 'data').then(([chunk]) => chunk.toString()),
      once(server, 'exit').then(() => assert.fail(errors))
    ]);
    const address = first.match(/Local: (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    assert.ok(address, first);
    return address;
  }

  let base = await start();
  let sessionCookie;
  const get = (path, authenticated = false) => fetch(base + path, {
    redirect: 'manual',
    headers: authenticated ? { Cookie: sessionCookie } : {}
  });
  const post = (path, body, { authenticated = true, origin = base } = {}) => fetch(base + path, {
    method: 'POST',
    redirect: 'manual',
    body,
    headers: { Origin: origin, ...(authenticated && sessionCookie ? { Cookie: sessionCookie } : {}) }
  });

  assert.match(await (await get('/')).text(), /Salt Memory/);
  const pagesOrigin = env.PAGES_ORIGIN;
  const readCatalog = (origin) => fetch(base + '/api/artworks', { headers: { Origin: origin } });
  const initialCatalog = await readCatalog(pagesOrigin);
  assert.equal(initialCatalog.headers.get('access-control-allow-origin'), pagesOrigin);
  assert.equal(initialCatalog.headers.get('cache-control'), 'no-store');
  assert.equal(initialCatalog.headers.get('vary'), 'Origin');
  assert.equal((await initialCatalog.json()).works.length, 3);
  assert.equal((await readCatalog('https://other.example.test')).headers.get('access-control-allow-origin'), null);
  assert.equal((await get('/healthz')).status, 200);
  const filtered = await (await get('/?medium=Stoneware&q=Vessel')).text();
  assert.match(filtered, /Vessel for Rain/);
  assert.doesNotMatch(filtered, /Between Headlands/);
  assert.match(await (await get('/admin')).text(), /Staff sign-in/);
  assert.equal((await post('/admin/artwork/new', new FormData(), { authenticated: false })).status, 401);
  assert.equal((await post('/admin/login', new URLSearchParams({ email, password: 'invalid' }))).status, 401);
  const signedIn = await post('/admin/login', new URLSearchParams({ email, password }));
  assert.equal(signedIn.status, 303);
  assert.match(signedIn.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  sessionCookie = signedIn.headers.get('set-cookie').split(';')[0];
  const editor = await (await get('/admin/artwork/new', true)).text();
  const csrf = editor.match(/name="csrf" value="([a-f0-9]+)"/)?.[1];
  assert.ok(csrf);

  const sourceImage = await readFile('artwork/salt-memory.jpg');
  function artwork(overrides = {}, image) {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      csrf, title: 'New <Work>', artist: 'Test Artist', medium: 'Oil', alt_text: 'A coast in winter',
      status: 'draft', ...overrides
    })) form.set(key, value);
    if (image) form.set('image', new Blob([image], { type: 'image/jpeg' }), 'art.jpg');
    return form;
  }

  assert.equal((await post('/admin/artwork/new', artwork({}, sourceImage), { origin: 'https://example.test' })).status, 403);
  assert.equal((await post('/admin/artwork/new', artwork({ csrf: 'wrong' }, sourceImage))).status, 403);
  assert.equal((await post('/admin/artwork/new', artwork({}, Buffer.from('<svg/>')))).status, 422);
  assert.equal((await post('/admin/artwork/new', artwork({}, sourceImage))).status, 303);

  const dashboard = await (await get('/admin', true)).text();
  const id = dashboard.match(/href="\/admin\/artwork\/(\d+)" aria-label="Edit New &lt;Work&gt;"/)?.[1];
  assert.ok(id);
  assert.doesNotMatch(await (await get('/')).text(), /Test Artist/);
  assert.ok(!(await (await readCatalog(pagesOrigin)).json()).works.some((work) => String(work.id) === id));
  assert.equal((await get(`/artwork/${id}`)).status, 404);
  assert.equal((await get(`/image/${id}`)).status, 404);
  assert.equal((await get(`/admin/image/${id}`)).status, 401);
  assert.equal((await get(`/admin/image/${id}`, true)).status, 200);

  const replacement = await readFile('artwork/between-headlands.jpg');
  assert.equal((await post(`/admin/artwork/${id}`, artwork({ status: 'published', featured: 'yes' }, replacement))).status, 303);
  assert.match(await (await get('/')).text(), /View New &lt;Work&gt;/);
  const publishedCatalog = (await (await readCatalog(pagesOrigin)).json()).works;
  assert.equal(String(publishedCatalog[0].id), id);
  assert.equal(publishedCatalog[0].image_revision, 2);
  assert.equal(publishedCatalog[0].title, 'New <Work>');
  const imageResponse = await get(`/image/${id}`);
  assert.equal(imageResponse.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), replacement);

  server.kill();
  await once(server, 'exit');
  base = await start();
  assert.match(await (await get(`/artwork/${id}`)).text(), /Test Artist/);
  assert.equal((await post(`/admin/artwork/${id}`, artwork())).status, 303);
  assert.equal((await get(`/image/${id}`)).status, 404);
  assert.ok(!(await (await readCatalog(pagesOrigin)).json()).works.some((work) => String(work.id) === id));
  assert.equal((await post(`/admin/artwork/${id}/delete`, new URLSearchParams({ csrf }))).status, 303);
  assert.equal((await get(`/admin/image/${id}`, true)).status, 404);
  assert.equal((await post('/admin/logout', new URLSearchParams({ csrf }))).status, 303);
  assert.match(await (await get('/admin', true)).text(), /Staff sign-in/);
});
