import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { artworkColumns, db, transaction } from './db.mjs';
import { hashPassword, hashToken, randomToken, verifyPassword } from './auth.mjs';
import * as views from './views.mjs';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const publicUrl = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL;
const configuredOrigin = publicUrl ? new URL(publicUrl).origin : null;
const pagesOrigin = process.env.PAGES_ORIGIN ? new URL(process.env.PAGES_ORIGIN).origin : null;
const secure = configuredOrigin?.startsWith('https:');
if (process.env.NODE_ENV === 'production' && !secure) {
  throw new Error('Set PUBLIC_ORIGIN to the HTTPS URL in production.');
}

const cookieName = secure ? '__Host-sill_session' : 'sill_session';
const sessionLifetime = 8 * 60 * 60;
const maxImage = 6 * 1024 * 1024;
const styling = readFileSync(new URL('../public/site.css', import.meta.url));
const dummyPasswordHash = await hashPassword(randomToken());
const loginAttempts = new Map();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function html(res, page, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
}

function redirect(res, location, headers = {}) {
  res.writeHead(303, { Location: location, ...headers });
  res.end();
}

function cookie(token, age) {
  return `${cookieName}=${token}; Path=/; Max-Age=${age}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function sessionFor(req) {
  const match = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`));
  if (!match) return;
  return db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .get(hashToken(match[1]), Date.now());
}

function verifyOrigin(req) {
  const origin = req.headers.origin;
  const localPort = req.socket.localPort;
  const localOrigins = [`http://localhost:${localPort}`, `http://127.0.0.1:${localPort}`];
  if (configuredOrigin ? origin !== configuredOrigin : !localOrigins.includes(origin)) {
    throw new HttpError(403, 'Submit this form from the gallery website.');
  }
}

function verifyCsrf(form, session) {
  const submitted = form.get('csrf');
  if (typeof submitted !== 'string' || !/^[a-f0-9]{64}$/.test(submitted) ||
      !timingSafeEqual(Buffer.from(submitted), Buffer.from(session.csrf))) {
    throw new HttpError(403, 'Reload the form and try again.');
  }
}

async function readForm(req, limit) {
  const contentType = req.headers['content-type'] || '';
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)(?:;|$)/i.test(contentType)) {
    throw new HttpError(415, 'Unsupported form format.');
  }
  if (Number(req.headers['content-length']) > limit) {
    req.resume();
    throw new HttpError(413, 'The upload is too large. Use an image up to 6 MB.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      req.resume();
      throw new HttpError(413, 'The upload is too large. Use an image up to 6 MB.');
    }
    chunks.push(chunk);
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': contentType }
    }).formData();
  } catch {
    throw new HttpError(400, 'The form could not be read.');
  }
}

function formText(form, key) {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function publicHome(url, res) {
  const query = (url.searchParams.get('q') || '').trim().slice(0, 120);
  const medium = (url.searchParams.get('medium') || '').slice(0, 80);
  const published = "FROM artworks WHERE status = 'published'";
  const featured = db.prepare(`SELECT ${artworkColumns} ${published} AND featured = 1`).get();
  const media = db.prepare(`SELECT DISTINCT medium ${published} ORDER BY medium COLLATE NOCASE`).all();
  const matches = `AND (? = '' OR medium = ?) AND
    (instr(lower(title), lower(?)) > 0 OR instr(lower(artist), lower(?)) > 0)`;
  const works = db.prepare(`SELECT ${artworkColumns} ${published} ${matches}
    ORDER BY featured DESC, id DESC`).all(medium, medium, query, query);
  html(res, views.home({ featured, media, works, query, medium }));
}

function sendImage(req, res, id, admin) {
  const visibility = admin ? '' : "AND status = 'published'";
  const image = db.prepare(`SELECT image_type, image, image_revision FROM artworks WHERE id = ? ${visibility}`).get(id);
  if (!image) throw new HttpError(404, 'This image is unavailable.');
  const etag = `"artwork-${id}-${image.image_revision}"`;
  res.setHeader('ETag', etag);
  if (!admin && req.headers['if-none-match'] === etag) {
    res.writeHead(304).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': image.image_type, 'Content-Length': image.image.length });
  res.end(image.image);
}

async function signIn(req, res) {
  const form = await readForm(req, 8192);
  const email = formText(form, 'email').toLowerCase().slice(0, 254);
  const password = form.get('password');
  if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 256) {
    return html(res, views.login('Enter a valid email and password.', email), 401);
  }

  const now = Date.now();
  for (const [address, record] of loginAttempts) {
    if (record.expires <= now) loginAttempts.delete(address);
  }
  const address = req.socket.remoteAddress;
  const record = loginAttempts.get(address) || { expires: now + 15 * 60_000, count: 0 };
  if (record.count >= 10) {
    res.setHeader('Retry-After', Math.ceil((record.expires - now) / 1000));
    return html(res, views.login('Too many sign-in attempts. Try again in a few minutes.', email), 429);
  }
  record.count++;
  loginAttempts.set(address, record);
  const user = db.prepare('SELECT id, password_hash FROM admins WHERE email = ?').get(email);
  const valid = await verifyPassword(password, user?.password_hash || dummyPasswordHash);
  if (!user || !valid) return html(res, views.login('Email or password is incorrect.', email), 401);

  const token = randomToken();
  const existing = sessionFor(req);
  const created = transaction(() => {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR token_hash = ?').run(now, existing?.token_hash || '');
    return db.prepare(`
      INSERT INTO sessions (token_hash, admin_id, csrf, expires_at)
      SELECT ?, id, ?, ? FROM admins WHERE id = ? AND password_hash = ?
    `).run(hashToken(token), randomToken(), now + sessionLifetime * 1000, user.id, user.password_hash).changes;
  });
  if (!created) return html(res, views.login('Please try signing in again.', email), 401);
  loginAttempts.delete(address);
  redirect(res, '/admin', { 'Set-Cookie': cookie(token, sessionLifetime) });
}

function imageType(bytes) {
  if (bytes.length < 16) return;
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) &&
      bytes.subarray(-2).equals(Buffer.from([0xff, 0xd9]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      bytes.toString('ascii', 12, 16) === 'IHDR') return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP' &&
      bytes.readUInt32LE(4) === bytes.length - 8) return 'image/webp';
}

const fieldLimits = {
  title: 120, artist: 120, medium: 80, year: 20, dimensions: 80, description: 2000, alt_text: 240
};

async function saveArtwork(form, work, session, res) {
  const values = Object.fromEntries(Object.keys(fieldLimits).map((key) => [key, formText(form, key)]));
  values.status = formText(form, 'status');
  values.featured = values.status === 'published' && form.get('featured') === 'yes';
  const invalidField = Object.entries(fieldLimits).find(([key, limit]) => values[key].length > limit);
  let error = '';
  if (invalidField) error = 'One of the artwork fields exceeds its character limit.';
  if (!values.title || !values.artist || !values.medium || !values.alt_text) {
    error = 'Enter a title, artist, medium and image description.';
  }
  if (!['draft', 'published'].includes(values.status)) error = 'Select an artwork visibility.';

  const upload = form.get('image');
  let image;
  let type;
  if (!error && upload instanceof File && upload.size) {
    if (upload.size > maxImage) {
      error = 'Choose an image up to 6 MB.';
    } else {
      image = Buffer.from(await upload.arrayBuffer());
      type = imageType(image);
      if (!type) error = 'Choose a JPEG, PNG or WebP image.';
    }
  } else if (!error && !work) {
    error = 'Choose an artwork image.';
  }

  if (error) {
    const message = image || (upload instanceof File && upload.size)
      ? `${error} Select the image again before saving.`
      : error;
    return html(res, views.editor(work, session, { error: message, values }), 422);
  }

  transaction(() => {
    if (!db.prepare('SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?').get(session.token_hash, Date.now())) {
      throw new HttpError(403, 'Sign in again before saving.');
    }
    if (work && !db.prepare('SELECT 1 FROM artworks WHERE id = ?').get(work.id)) {
      throw new HttpError(404, 'This artwork is unavailable.');
    }
    if (values.featured) db.prepare('UPDATE artworks SET featured = 0 WHERE featured = 1').run();
    const fields = [...Object.keys(fieldLimits).map((key) => values[key]), values.status, Number(values.featured)];
    if (work) {
      db.prepare(`UPDATE artworks SET title = ?, artist = ?, medium = ?, year = ?, dimensions = ?,
        description = ?, alt_text = ?, status = ?, featured = ? WHERE id = ?`).run(...fields, work.id);
      if (image) db.prepare('UPDATE artworks SET image_type = ?, image = ?, image_revision = image_revision + 1 WHERE id = ?')
        .run(type, image, work.id);
    } else {
      db.prepare(`INSERT INTO artworks (title, artist, medium, year, dimensions, description, alt_text,
        status, featured, image_type, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...fields, type, image);
    }
  });
  redirect(res, '/admin?result=saved');
}

async function route(req, res) {
  const url = new URL(req.url, 'http://gallery.invalid');
  const path = url.pathname;
  const get = req.method === 'GET' || req.method === 'HEAD';
  if (!get && req.method !== 'POST') throw new HttpError(405, 'This method is unavailable.');
  if (get && path === '/site.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }).end(styling);
    return;
  }
  if (get && path === '/') return publicHome(url, res);
  if (get && path === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('ok');
    return;
  }
  if (get && path === '/api/artworks') {
    const works = db.prepare(`SELECT id, title, artist, medium, year, dimensions,
      description, alt_text, featured, image_revision FROM artworks
      WHERE status = 'published' ORDER BY featured DESC, id DESC`).all();
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    if (pagesOrigin && req.headers.origin === pagesOrigin) {
      res.setHeader('Access-Control-Allow-Origin', pagesOrigin);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      .end(JSON.stringify({ works }));
    return;
  }

  const publicRoute = path.match(/^\/(artwork|image)\/([1-9][0-9]{0,14})$/);
  if (get && publicRoute) {
    const [, kind, id] = publicRoute;
    if (kind === 'image') return sendImage(req, res, id, false);
    const work = db.prepare(`SELECT ${artworkColumns} FROM artworks WHERE id = ? AND status = 'published'`).get(id);
    if (!work) throw new HttpError(404, 'This artwork is unavailable.');
    return html(res, views.detail(work));
  }

  if (path === '/admin' || path.startsWith('/admin/')) {
    res.setHeader('Cache-Control', 'no-store');
    if (!get) verifyOrigin(req);
    if (!get && path === '/admin/login') return signIn(req, res);

    const session = sessionFor(req);
    if (!session) {
      if (get && path === '/admin') return html(res, views.login());
      if (get && !path.startsWith('/admin/image/')) return redirect(res, '/admin');
      throw new HttpError(401, 'Sign in to access the artwork manager.');
    }

    if (get && path === '/admin') {
      const works = db.prepare(`SELECT ${artworkColumns} FROM artworks ORDER BY id DESC`).all();
      const result = url.searchParams.get('result');
      const message = result === 'saved' ? 'Artwork saved.' : result === 'deleted' ? 'Artwork deleted.' : '';
      return html(res, views.dashboard(works, session, message));
    }
    const image = path.match(/^\/admin\/image\/([1-9][0-9]{0,14})$/);
    if (get && image) return sendImage(req, res, image[1], true);
    if (!get && path === '/admin/logout') {
      verifyCsrf(await readForm(req, 8192), session);
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(session.token_hash);
      return redirect(res, '/admin', { 'Set-Cookie': cookie('', 0) });
    }

    const edit = path.match(/^\/admin\/artwork\/(new|[1-9][0-9]{0,14})(\/delete)?$/);
    if (edit && !(edit[2] && (get || edit[1] === 'new'))) {
      const work = edit[1] === 'new' ? null : db.prepare(`SELECT ${artworkColumns} FROM artworks WHERE id = ?`).get(edit[1]);
      if (work === undefined) throw new HttpError(404, 'This artwork is unavailable.');
      if (get) return html(res, views.editor(work, session));
      const form = await readForm(req, edit[2] ? 8192 : maxImage + 65536);
      verifyCsrf(form, session);
      if (edit[2]) {
        const { changes } = db.prepare(`DELETE FROM artworks WHERE id = ? AND EXISTS (
          SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?)`
        ).run(work.id, session.token_hash, Date.now());
        if (!changes) throw new HttpError(409, 'The artwork could not be deleted. Reload the dashboard.');
        return redirect(res, '/admin?result=deleted');
      }
      return saveArtwork(form, work, session, res);
    }
  }
  throw new HttpError(404, 'The page you requested could not be found.');
}

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  try {
    await route(req, res);
  } catch (error) {
    if (error instanceof HttpError) {
      const title = error.status === 404 ? 'Page not found' : 'Request could not be completed';
      return html(res, views.errorPage(title, error.message), error.status);
    }
    console.error(error);
    if (res.headersSent) return res.destroy();
    html(res, views.errorPage('Something went wrong', 'Try again in a moment.'), 500);
  }
});
server.listen(port, host, () => console.log(`Local: http://${host}:${server.address().port}`));
