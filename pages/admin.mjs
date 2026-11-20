import { supabase } from './config.js';
import { galleryClient } from './supabase-client.js';
import { artworks, bucket, readGallery, artworkImages } from './gallery-store.js';
import { escape } from './catalog-view.js';
import { loginContent, dashboardContent, editorContent } from './admin-view.js';

const main = document.querySelector('main');
const dashboard = './admin.html';
const client = galleryClient(supabase, true);
const query = new URLSearchParams(window.location.search);
const edit = query.get('edit');
const links = {
  dashboard,
  edit: (id) => `${dashboard}?edit=${id}`,
  delete: () => '#delete',
  logout: '#logout',
  image: () => ''
};
const imageExtensions = new Map([
  ['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']
]);
const fieldNames = ['title', 'artist', 'medium', 'year', 'dimensions', 'description', 'alt_text'];
let work;
let busy = false;

function showMessage(message) {
  const old = main.querySelector('.action-alert');
  old?.remove();
  const alert = document.createElement('p');
  alert.className = 'alert action-alert';
  alert.setAttribute('role', 'alert');
  alert.textContent = message;
  main.prepend(alert);
  alert.scrollIntoView({ block: 'nearest' });
}

async function reportStorageCleanup(path) {
  if (!path) return '';
  try {
    const { data, error } = await client.storage.from(bucket).remove([path]);
    return error || !data?.length ? '&cleanup=pending' : '';
  } catch {
    return '&cleanup=pending';
  }
}

async function staffAccess() {
  const { data, error } = await client.rpc('is_gallery_staff');
  if (error) throw new Error('The gallery backend is unavailable. Try again shortly.');
  return data === true;
}

async function start() {
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw new Error('The staff portal could not check your sign-in. Try refreshing.');
  if (!session) {
    main.innerHTML = loginContent('', '', '#signin');
    return;
  }
  if (!(await staffAccess())) {
    await client.auth.signOut({ scope: 'local' });
    main.innerHTML = loginContent('This account has not been granted gallery staff access.', '', '#signin');
    return;
  }

  if (!edit) {
    const works = await readGallery(client, { staff: true });
    links.image = await artworkImages(client, works, supabase.url);
    const message = { saved: 'Artwork saved.', deleted: 'Artwork deleted.' }[query.get('result')];
    const cleanup = query.get('cleanup') === 'pending' ? 'An unused image may still be in storage.' : '';
    main.innerHTML = dashboardContent(works, null, typeof message === 'string' ? message : '', links, cleanup);
    return;
  }
  if (edit === 'new') {
    main.innerHTML = editorContent(null, null, { links });
    return;
  }
  if (/^[1-9][0-9]{0,9}$/.test(edit)) {
    [work] = await readGallery(client, { staff: true, id: edit });
  }
  if (!work) {
    main.innerHTML = `<a class="back" href="${dashboard}">Back to artwork</a><h1>Artwork unavailable</h1>`;
    return;
  }
  links.image = await artworkImages(client, [work], supabase.url);
  main.innerHTML = editorContent(work, null, { links });
}

async function signIn(form) {
  const email = form.get('email').trim();
  const { error } = await client.auth.signInWithPassword({ email, password: form.get('password') });
  if (error) {
    const message = error.status === 429 ? 'Too many attempts. Try again later.' : 'Sign-in failed. Check your email and password.';
    main.innerHTML = loginContent(message, email, '#signin');
    return;
  }
  window.location.reload();
}

async function save(form) {
  const values = Object.fromEntries(fieldNames.map((key) => [key, form.get(key).trim()]));
  values.status = form.get('status');
  values.featured = values.status === 'published' && form.get('featured') === 'yes';
  const file = form.get('image');
  let newImage;
  if (file?.size) {
    const extension = imageExtensions.get(file.type);
    if (!extension || file.size > 6 * 1024 * 1024) {
      throw new Error('Choose a JPEG, PNG or WebP image up to 6 MB.');
    }
    newImage = `${crypto.randomUUID()}.${extension}`;
    const { error } = await client.storage.from(bucket).upload(newImage, file, { cacheControl: '60' });
    if (error) throw new Error('The image could not be uploaded. Try again.');
    values.image_path = newImage;
    values.sample_file = null;
  } else if (!work) {
    throw new Error('Choose an artwork image.');
  }

  let saved = false;
  try {
    const table = client.from(artworks);
    const change = work ? table.update(values).eq('id', work.id).eq('version', work.version) : table.insert(values);
    const { data, error } = await change.select('id').maybeSingle();
    if (error) throw new Error('Artwork could not be saved. Check the fields and try again.');
    if (!data) throw new Error('This artwork changed in another session. Reload the page before saving.');
    saved = true;
  } finally {
    // Storage permits removal only when no catalog entry references the upload.
    if (!saved && newImage) await reportStorageCleanup(newImage);
  }
  const cleanup = newImage ? await reportStorageCleanup(work?.image_path) : '';
  window.location.replace(`${dashboard}?result=saved${cleanup}`);
}

async function removeArtwork() {
  const { data, error } = await client.from(artworks).delete()
    .eq('id', work.id).eq('version', work.version).select('id').maybeSingle();
  if (error || !data) throw new Error('Artwork could not be deleted. Reload the page and try again.');
  const cleanup = await reportStorageCleanup(work.image_path);
  window.location.replace(`${dashboard}?result=deleted${cleanup}`);
}

main.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const form = event.target;
  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    const action = form.getAttribute('action');
    if (action === '#signin') {
      await signIn(new FormData(form));
    } else if (action === '#logout') {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw new Error('Sign-out failed. Try again.');
      window.location.replace(dashboard);
    } else if (action === '#delete') {
      await removeArtwork();
    } else {
      await save(new FormData(form));
    }
  } catch (error) {
    showMessage(error instanceof Error ? error.message : 'The request could not be completed.');
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});

start().catch((error) => {
  const message = error instanceof Error ? error.message : 'The staff portal could not load. Try again shortly.';
  main.innerHTML = `<p class="alert" role="alert">${escape(message)}</p><a href="${dashboard}">Try again</a>`;
});
