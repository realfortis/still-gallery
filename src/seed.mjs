import { readFileSync } from 'node:fs';
import { db, transaction } from './db.mjs';

import { exampleWorks } from './examples.mjs';

transaction(() => {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'seeded'").get()) {
    console.log('The example collection has already been seeded.');
    return;
  }
  if (db.prepare('SELECT 1 FROM artworks LIMIT 1').get()) {
    console.log('The catalog already contains artwork. Seeding was skipped.');
    return;
  }
  const insert = db.prepare(`
    INSERT INTO artworks (title, artist, medium, year, dimensions, description, alt_text,
      status, featured, image_type, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, 'image/jpeg', ?)
  `);
  for (const { title, artist, medium, year, dimensions, description, alt_text, file, featured } of exampleWorks) {
    const image = readFileSync(new URL(`../artwork/${file}`, import.meta.url));
    insert.run(title, artist, medium, year, dimensions, description, alt_text, featured, image);
  }
  db.prepare("INSERT INTO settings VALUES ('seeded', 'yes')").run();
  console.log('Added three example artworks.');
});
