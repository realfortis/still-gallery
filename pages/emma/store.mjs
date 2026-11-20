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

function memberships(page) {
  return (page?.placements || []).map((item) => item.work_id);
}

export async function loadPage(client, route, preview) {
  const visibility = (query) => preview ? query : query.eq('published', true);
  const data = preview
    ? await Promise.all([
      client.from('emma_settings').select('*').maybeSingle().then(check),
      client.from('emma_pages').select('*').eq('route', route).maybeSingle().then(check),
      rows(client, 'emma_pages', 'route,title,kind,roster_order')
    ]).then(([settings, page, list]) => ({ settings, page, list }))
    : check(await client.rpc('emma_public_page', { page_route: route }));
  const { settings, page, list } = data;
  const ids = [...new Set(memberships(page))];
  const works = [];
  for (let index = 0; index < ids.length; index += 75) {
    works.push(...await rows(client, 'emma_artworks', '*', (query) =>
      visibility(query).in('id', ids.slice(index, index + 75))));
  }
  const assets = [...works.map((work) => work.asset_id), settings?.logo, settings?.background];
  const template = document.createElement('template');
  template.innerHTML = page?.body || '';
  for (const node of template.content.querySelectorAll('[data-asset]')) assets.push(node.dataset.asset);
  const assetRows = [];
  const unique = [...new Set(assets.filter(isUuid))];
  for (let index = 0; index < unique.length; index += 75) {
    assetRows.push(...await rows(client, 'emma_assets', 'id,detail,thumbnail', (query) =>
      query.in('id', unique.slice(index, index + 75))));
  }
  return { settings, page, list, works, assets: assetRows };
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
