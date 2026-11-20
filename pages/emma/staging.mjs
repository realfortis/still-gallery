export function check({ data, error }, message) {
  if (error) throw new Error(`${message}: ${error.message}`);
  return data;
}

async function chunks(values, run) {
  for (let index = 0; index < values.length; index += 100) await run(values.slice(index, index + 100));
}

export async function stageSnapshot(client, snapshot, { readImage, notify = () => {} }) {
  const selected = snapshot.assets.filter((image) => image.detail && image.thumb && !image.error);
  const available = new Set(selected.map((image) => image.id));
  for (const image of selected) {
    if (!/^[a-f0-9-]{36}$/.test(image.id) || image.detail !== image.id + '.webp' ||
        image.thumb !== image.id + '-thumb.webp') throw new Error('Invalid image path in manifest.');
  }

  const previous = check(await client.from('emma_settings').select('published').maybeSingle(), 'Gallery tables are unavailable');
  if (previous?.published) throw new Error('The client gallery is already public. Use the staff portal for further edits.');
  notify(`Importing ${selected.length} image pairs as staff-only drafts.`);
  const bucket = client.storage.from('emma-gallery');
  for (let index = 0; index < selected.length; index += 4) {
    const batch = selected.slice(index, index + 4);
    await Promise.all(batch.map(async (image) => {
      for (const name of [image.detail, image.thumb]) {
        const bytes = await readImage(name);
        const result = await bucket.upload(name, bytes, { contentType: 'image/webp', cacheControl: '60' });
        if (result.error && !(String(result.error.statusCode) === '409' || result.error.error === 'Duplicate')) {
          check(result, `Could not upload ${name}`);
        }
      }
    }));
    check(await client.from('emma_assets').upsert(batch.map((image) => ({
      id: image.id, detail: image.detail, thumbnail: image.thumb, site_media: image.kind === 'site', approved: false
    })), { onConflict: 'id', ignoreDuplicates: true }), 'Could not register image batch');
    if (!(index % 100)) notify(`Uploaded ${Math.min(index + batch.length, selected.length)}/${selected.length} image pairs.`);
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
  return `Staged ${works.length} artwork records and ${snapshot.pages.length} pages for staff review.`;
}
