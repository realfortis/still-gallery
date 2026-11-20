import { escape as e } from '../../src/catalog-view.mjs';
import { loginContent } from '../../src/views.mjs';
import { emmaClient, bucketName, check, rows } from './store.mjs';

const app = document.querySelector('main');
const client = emmaClient(true);
const types = new Map([
  ['artwork', 'emma_artworks'], ['page', 'emma_pages'], ['settings', 'emma_settings']
]);
const query = new URLSearchParams(location.search);
const view = query.get('view') || '';
const key = query.get('edit') || '';
const action = (name) => `./admin.html?view=${name}`;
const textarea = (key, label, value = '') =>
  `<label>${e(label)}<textarea name="${key}" rows="6">${e(value ?? '')}</textarea></label>`;
const input = (key, label, value = '', options = '') =>
  `<label>${e(label)}<input name="${key}" value="${e(value ?? '')}" ${options}></label>`;
const visibility = (item, label = 'Published') =>
  `<label class="check"><input type="checkbox" name="published" ${item?.published ? 'checked' : ''}> ${label}</label>`;
const editorLinks = `<p><a href="./admin.html">Staff overview</a> · <a href="./index.html?preview">Preview gallery drafts</a></p>`;
let existing;
let busy = false;

function showError(error) {
  const previous = app.querySelector('[data-error]');
  previous?.remove();
  const notice = document.createElement('p');
  notice.dataset.error = '';
  notice.className = 'alert';
  notice.setAttribute('role', 'alert');
  notice.textContent = error instanceof Error ? error.message : 'The action could not be completed.';
  app.prepend(notice);
  notice.scrollIntoView({ block: 'nearest' });
}

function editUrl(type, value) {
  return action(type) + '&edit=' + encodeURIComponent(value);
}

function listResults(data, type) {
  const list = app.querySelector('ul');
  const search = app.querySelector('input[type=search]');
  const render = () => {
    const term = search.value.toLocaleLowerCase().trim();
    const matched = data.filter((item) => [item.title, item.artist, item.route].some((field) =>
      field?.toLocaleLowerCase().includes(term)));
    const items = matched.slice(0, 100).map((item) => {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = [item.title || 'Title pending', item.artist || item.kind].filter(Boolean).join(' · ');
      const state = document.createElement('span');
      state.className = item.published ? 'state published' : 'state';
      state.textContent = item.published ? 'Published' : 'Draft';
      const link = document.createElement('a');
      link.className = 'button secondary';
      link.textContent = 'Edit';
      link.href = editUrl(type, item.id || item.route);
      li.append(text, state, link);
      return li;
    });
    list.replaceChildren(...items);
    app.querySelector('[data-total]').textContent =
      matched.length > 100 ? `Showing 100 of ${matched.length}. Search to narrow the list.` : `${matched.length} results`;
  };
  search.addEventListener('input', render);
  render();
}

async function showList(type) {
  const artwork = type === 'artwork';
  const title = artwork ? 'Artwork' : 'Artists, exhibitions and pages';
  app.innerHTML = `${editorLinks}<div class="admin-heading"><h1>${title}</h1>
    <a class="button primary" href="${editUrl(type, 'new')}">${artwork ? 'Add artwork' : 'Add page'}</a></div>
    <label>Search<input type="search" placeholder="${artwork ? 'Artwork or artist' : 'Page title or type'}"></label>
    <p data-total role="status"></p><ul class="work-list"></ul>`;
  const data = await rows(client, types.get(type),
    artwork ? 'id,title,artist,published' : 'route,title,kind,published');
  listResults(data, type);
}

function editor(title, fields, type) {
  app.innerHTML = `${editorLinks}<div class="admin-heading"><h1>${e(title)}</h1></div>
    <form class="panel stack" data-action="${type}">${fields}<button class="button primary">Save</button></form>`;
}

function showArtwork() {
  const item = existing || {};
  editor(existing ? 'Edit artwork' : 'Add artwork', `
    ${input('title', 'Artwork title', item.title, 'maxlength="250"')}
    ${input('artist', 'Artist', item.artist, 'maxlength="250"')}
    ${textarea('caption', 'Lightbox caption (medium, dimensions, credit, and approved details)', item.caption)}
    <label>${existing ? 'Replace image' : 'Image'}<input type="file" name="image" accept="image/jpeg,image/png,image/webp" ${existing ? '' : 'required'}></label>
    ${visibility(item)}`, 'artwork');
}

async function showPage() {
  const item = existing || {};
  const kind = item.kind || 'exhibition';
  editor(existing ? 'Edit page' : 'Add page', `
    ${input('title', 'Display title', item.title, 'required maxlength="250"')}
    ${input('route', 'Page address, e.g. summer-show.htm', item.route, existing ? 'readonly' : 'required pattern="[A-Za-z0-9_.-]+\\.html?"')}
    <label>Page type<select name="kind">${['page','artist','exhibition','historical'].map((type) =>
      `<option ${type === kind ? 'selected' : ''}>${type}</option>`).join('')}</select></label>
    ${input('roster_order', 'Artist position in the sidebar (optional)', item.roster_order, 'type="number" min="0"')}
    <label class="check"><input type="checkbox" name="override" ${item.body_text != null ? 'checked' : ''}> Replace the imported page text with the text below</label>
    ${textarea('body_text', 'Page text', item.body_text)}
    <section class="stack"><h2>Artwork order</h2><label>Find artwork<input type="search" data-work-search></label>
    <label>Choose a result<select data-work-options aria-label="Choose artwork"></select></label>
    <button type="button" class="button secondary" data-add>Add to page</button>
    <ol data-order></ol></section>
    ${visibility(item)}`, 'page');
  const entries = (item.placements || []).map((entry) => ({ ...entry }));
  const data = await rows(client, 'emma_artworks', 'id,title,artist');
  const lookup = new Map(data.map((work) => [work.id, [work.title, work.artist].filter(Boolean).join(' · ')]));
  const form = app.querySelector('form');
  const options = form.querySelector('[data-work-options]');
  const search = form.querySelector('[data-work-search]');
  const order = form.querySelector('[data-order]');
  const filter = () => {
    const term = search.value.trim().toLocaleLowerCase();
    options.replaceChildren(...data.filter((work) => lookup.get(work.id).toLocaleLowerCase().includes(term))
      .slice(0, 30).map((work) => new Option(lookup.get(work.id) || 'Title pending', work.id)));
  };
  const render = () => {
    order.replaceChildren(...entries.map((entry, index) => {
      const row = document.createElement('li');
      row.append(document.createTextNode((lookup.get(entry.work_id) || 'Unidentified work') + ' '));
      for (const [label, offset] of [['Up', -1], ['Down', 1], ['Remove', 0]]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.disabled = offset && !entries[index + offset];
        button.onclick = () => {
          const [moved] = entries.splice(index, 1);
          if (offset) entries.splice(index + offset, 0, moved);
          render();
        };
        row.append(button);
      }
      return row;
    }));
    form.querySelector('input[name=placements]').value = JSON.stringify(entries);
  };
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = 'placements';
  form.append(hidden);
  search.oninput = filter;
  form.querySelector('[data-add]').onclick = () => {
    if (options.value) entries.push({ work_id: options.value, caption: '', group: 'gallery' });
    render();
  };
  filter();
  render();
}

async function showSettings() {
  const item = check(await client.from('emma_settings').select('*').maybeSingle()) || {};
  existing = item;
  editor('Gallery details', `
    ${input('title', 'Gallery name', item.title, 'required')}
    ${input('address', 'Address and contact line', item.address, 'required')}
    ${textarea('hours', 'Opening hours', item.hours)}
    ${input('font_project', 'Adobe Fonts project ID (optional)', item.font_project, 'pattern="[A-Za-z0-9]*"')}
    <label class="check"><input name="features_custom" type="checkbox" ${item.features_custom ? 'checked' : ''}> Use the edited homepage features</label>
    ${textarea('features', 'Featured exhibition page addresses, one per line in display order', (item.features || []).join('\n'))}
    ${visibility(item, 'Make the gallery available to the public')}`, 'settings');
}

async function start() {
  const { session } = check(await client.auth.getSession());
  if (!session) {
    app.innerHTML = loginContent('', '', '#signin');
    app.querySelector('form').dataset.action = 'login';
    return;
  }
  if (!check(await client.rpc('is_gallery_staff'))) {
    await client.auth.signOut({ scope: 'local' });
    app.innerHTML = loginContent('This account has no gallery staff access.', '', '#signin');
    app.querySelector('form').dataset.action = 'login';
    return;
  }
  if (view === 'settings') return showSettings();
  if (EMMA_MODE === 'local' && view === 'import') {
    app.innerHTML = `${editorLinks}<h1>Stage the captured catalog</h1>
      <p>Upload the private review copy to the existing Supabase project as drafts. This can take a few minutes.</p>
      <form data-action="import"><button class="button primary">Stage as drafts</button></form>
      <p role="status" data-import-status></p>`;
    return;
  }
  if (!types.has(view)) {
    app.innerHTML = `<h1>Manage Emma Butler Gallery</h1><div class="toolbar">
      <a class="button primary" href="${action('artwork')}">Artwork</a>
      <a class="button secondary" href="${action('page')}">Artists and exhibitions</a>
      <a class="button secondary" href="${action('settings')}">Gallery details</a>
      <a class="button secondary" href="./index.html?preview">Preview drafts</a>
      ${EMMA_MODE === 'local' ? `<a class="button secondary" href="${action('import')}">Stage captured catalog</a>` : ''}
      <form data-action="logout"><button class="button secondary">Sign out</button></form></div>`;
    return;
  }
  if (!key) return showList(view);
  if (key !== 'new') {
    existing = check(await client.from(types.get(view)).select('*')
      .eq(view === 'artwork' ? 'id' : 'route', key).maybeSingle());
    if (!existing) throw new Error('This record is unavailable.');
  }
  if (view === 'artwork') showArtwork();
  else await showPage();
}

async function webImage(bitmap, size, quality) {
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((value) =>
    value?.type === 'image/webp' ? resolve(value) : reject(new Error('WebP image creation failed.')), 'image/webp', quality));
}

async function upload(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
    throw new Error('Choose a JPEG, PNG or WebP image up to 12 MB.');
  }
  const bitmap = await createImageBitmap(file);
  const storage = client.storage.from(bucketName);
  const id = crypto.randomUUID();
  const name = id + '.webp';
  const thumb = id + '-thumb.webp';
  try {
    const [detail, thumbnail] = await Promise.all([webImage(bitmap, 1800, .84), webImage(bitmap, 520, .8)]);
    check(await storage.upload(name, detail, { contentType: 'image/webp', cacheControl: '60' }));
    check(await storage.upload(thumb, thumbnail, { contentType: 'image/webp', cacheControl: '60' }));
    check(await client.from('emma_assets').insert({ id, detail: name, thumbnail: thumb, approved: true }));
    return id;
  } catch (error) {
    // Storage will refuse to delete files once the database has registered them.
    await storage.remove([name, thumb]).catch(() => {});
    throw error;
  } finally {
    bitmap.close();
  }
}

const val = (form, key) => String(form.get(key) || '').trim();

async function saveArtwork(form) {
  const published = form.has('published');
  const values = { title: val(form, 'title'), artist: val(form, 'artist'),
    caption: val(form, 'caption'), published, edited: true };
  if (published && (!values.title || !values.artist)) throw new Error('A title and an artist are required to publish.');
  const image = form.get('image');
  let added;
  try {
    if (image?.size) values.asset_id = added = await upload(image);
    if (!existing && !added) throw new Error('An artwork image is required.');
    if (published && !added) check(await client.from('emma_assets').update({ approved: true }).eq('id', existing.asset_id));
    const table = client.from('emma_artworks');
    check(await (existing ? table.update(values).eq('id', existing.id) : table.insert(values)));
  } catch (error) {
    if (added) {
      await client.from('emma_assets').delete().eq('id', added);
      await client.storage.from(bucketName).remove([added + '.webp', added + '-thumb.webp']);
    }
    throw error;
  }
}

async function savePage(form) {
  const route = val(form, 'route');
  if (!/^[A-Za-z0-9_.-]+\.html?$/.test(route) || ['admin.html','entry.html','404.html'].includes(route)) {
    throw new Error('Enter an available .htm or .html page address.');
  }
  const title = val(form, 'title');
  const sort = val(form, 'roster_order');
  const values = { title, html_title: existing?.title === title ? existing.html_title : `${title} · Emma Butler Gallery`,
    kind: val(form, 'kind'), roster_order: sort ? Number(sort) : null,
    body_text: form.has('override') ? val(form, 'body_text') : null,
    placements: JSON.parse(val(form, 'placements') || '[]'), published: form.has('published') };
  const table = client.from('emma_pages');
  check(await (existing ? table.update(values).eq('route', existing.route) : table.insert({ route, ...values })));
}

async function saveSettings(form) {
  const values = { id: true, title: val(form, 'title'), address: val(form, 'address'), hours: val(form, 'hours'),
    font_project: val(form, 'font_project'), features_custom: form.has('features_custom'),
    features: val(form, 'features').split(/\r?\n/).map((feature) => feature.trim()).filter(Boolean),
    published: form.has('published') };
  check(await client.from('emma_settings').upsert(values));
}

app.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  if (event.submitter) event.submitter.disabled = true;
  const form = new FormData(event.target);
  const type = event.target.dataset.action;
  try {
    if (type === 'login') {
      check(await client.auth.signInWithPassword({ email: val(form, 'email'), password: form.get('password') }));
      location.reload();
    } else if (type === 'logout') {
      check(await client.auth.signOut({ scope: 'local' }));
      location.assign('./admin.html');
    } else if (EMMA_MODE === 'local' && type === 'import') {
      const { stageSnapshot } = await import('./staging.mjs');
      const status = app.querySelector('[data-import-status]');
      const manifest = await fetch('./preview.json', { cache: 'no-store' });
      if (!manifest.ok) throw new Error('The private capture could not be opened.');
      status.textContent = await stageSnapshot(client, await manifest.json(), {
        async readImage(name) {
          const response = await fetch('./media/' + encodeURIComponent(name));
          if (!response.ok) throw new Error('An image is missing from the private capture.');
          return response.blob();
        },
        notify(message) { status.textContent = message; }
      });
    } else {
      if (type === 'artwork') await saveArtwork(form);
      if (type === 'page') await savePage(form);
      if (type === 'settings') await saveSettings(form);
      location.assign(type === 'settings' ? './admin.html' : action(type));
    }
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    if (event.submitter) event.submitter.disabled = false;
  }
});

start().catch(showError);
