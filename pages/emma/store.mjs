import { galleryClient } from '../supabase-client.mjs';

export const bucketName = 'emma-gallery';
export const emmaClient = (staff = false) => galleryClient(EMMA_CONFIG, staff);

export function check(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function rows(client, table, columns = '*', filter = (query) => query) {
  const result = [];
  const order = table === 'emma_pages' ? 'route' : 'id';
  for (let start = 0; ; start += 250) {
    const batch = check(await filter(client.from(table).select(columns))
      .order(order).range(start, start + 249).abortSignal(AbortSignal.timeout(10000)));
    result.push(...batch);
    if (batch.length < 250) return result;
  }
}

async function withIds(client, table, columns, ids, filter = (query) => query) {
  const unique = [...new Set(ids.filter(isUuid))];
  const results = [];
  // Keep request URLs short without serializing requests for a large exhibition.
  for (let start = 0; start < unique.length; start += 300) {
    const group = unique.slice(start, start + 300);
    const batches = [];
    for (let index = 0; index < group.length; index += 75) {
      batches.push(rows(client, table, columns, (query) => filter(query).in('id', group.slice(index, index + 75))));
    }
    results.push(...(await Promise.all(batches)).flat());
  }
  return results;
}

export async function loadPage(client, route, preview) {
  return preview
    ? await Promise.all([
      client.from('emma_settings').select('*').maybeSingle().then(check),
      client.from('emma_pages').select('*').eq('route', route).maybeSingle().then(check),
      rows(client, 'emma_pages', 'route,title,kind,roster_order')
    ]).then(([settings, page, list]) => ({ settings, page, list }))
    : check(await client.rpc('emma_public_page', { page_route: route }));
}

export async function loadPageMedia(client, { settings, page }, preview) {
  const visibility = (query) => preview ? query : query.eq('published', true);
  const [works, siteAssets] = await Promise.all([
    withIds(client, 'emma_artworks', 'id,asset_id,title,artist,caption,edited',
      (page.placements || []).map(({ work_id }) => work_id), visibility),
    withIds(client, 'emma_assets', 'id,detail,thumbnail',
      [...(page.media_ids || []), settings.logo, settings.background])
  ]);
  const artAssets = await withIds(client, 'emma_assets', 'id,detail,thumbnail',
    works.map(({ asset_id }) => asset_id).filter((id) => !siteAssets.some((asset) => asset.id === id)));
  return { works, assets: [...siteAssets, ...artAssets] };
}

export function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
}

export async function signedImages(client, paths) {
  const images = new Map();
  const unique = [...new Set(paths.filter(Boolean))];
  for (let index = 0; index < unique.length; index += 100) {
    const { data } = await client.storage.from(bucketName).createSignedUrls(unique.slice(index, index + 100), 600);
    for (const row of data || []) {
      if (row.signedUrl && new URL(row.signedUrl).origin === EMMA_CONFIG.url) images.set(row.path, row.signedUrl);
    }
  }
  return (path) => images.get(path) || '';
}
