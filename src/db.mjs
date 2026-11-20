import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const directory = resolve(process.env.DATA_DIR || 'data');
mkdirSync(directory, { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(resolve(directory, 'gallery.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id),
    csrf TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS artworks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    medium TEXT NOT NULL,
    year TEXT NOT NULL,
    dimensions TEXT NOT NULL,
    description TEXT NOT NULL,
    alt_text TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('draft', 'published')),
    featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0, 1)),
    image_type TEXT NOT NULL,
    image BLOB NOT NULL,
    image_revision INTEGER NOT NULL DEFAULT 1
  );
  CREATE UNIQUE INDEX IF NOT EXISTS one_featured_artwork ON artworks(featured) WHERE featured = 1;
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export const artworkColumns = 'id, title, artist, medium, year, dimensions, description, alt_text, status, featured, image_revision';

export function transaction(work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
