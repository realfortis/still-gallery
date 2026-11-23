import DOMPurify from 'dompurify';

const main = document.querySelector('main');
const dialog = document.querySelector('dialog');
const params = new URLSearchParams(location.search);
const currentPath = decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
const review = EMMA_MODE === 'review';
const route = review || currentPath === 'entry.html' ? (params.get('page') || 'index.html') : currentPath;
const source = review || params.has('preview') ? 'staff' : EMMA_MODE === 'local' ? 'local' : 'public';
const legacyPaths = new Set(EMMA_LEGACY_PATHS);
let lightboxGroup = [];
let lightboxIndex = 0;
let lightboxTrigger;
let lightboxRequest = 0;

function linkTo(page) {
  if (review) return page === 'index.html' ? './' : './?page=' + encodeURIComponent(page);
  const link = legacyPaths.has(page) ? './' + encodeURIComponent(page) : './entry.html?page=' + encodeURIComponent(page);
  return source === 'staff' ? link + (link.includes('?') ? '&' : '?') + 'preview' : link;
}

function applyImage(image, url, text) {
  if (typeof url?.then === 'function') {
    url.then((value) => applyImage(image, value, text), () => applyImage(image, '', text));
    return;
  }
  if (url) image.src = url;
  else {
    const substitute = document.createElement('span');
    substitute.className = 'image-missing';
    substitute.textContent = text || image.alt || 'Image unavailable';
    image.replaceWith(substitute);
  }
}

function safeContent(html) {
  return DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['a', 'b', 'blockquote', 'br', 'caption', 'center', 'div', 'em',
      'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'hr', 'i', 'img', 'li',
      'ol', 'p', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th',
      'thead', 'tr', 'u', 'ul'],
    ALLOWED_ATTR: ['align', 'class', 'colspan', 'height', 'href', 'alt', 'loading',
      'rowspan', 'width', 'data-work', 'data-asset', 'data-group',
      'data-art-caption', 'data-gallery-hours'],
    ALLOW_DATA_ATTR: false
  });
}

function applyHours(fragment, hours) {
  for (const node of fragment.querySelectorAll('[data-gallery-hours]')) {
    node.textContent = hours;
  }
}

function applyPageEdits(fragment, page, settings, list) {
  if (page.body_text != null) {
    if (page.kind === 'page') {
      fragment.replaceChildren();
    } else {
      for (const element of [...fragment.children]) {
        if (element.matches('p, blockquote')) element.remove();
      }
      const originalHeading = fragment.querySelector('h1,h2');
      if (originalHeading) originalHeading.remove();
    }
    const heading = document.createElement('h1');
    heading.textContent = page.title;
    const paragraph = document.createElement('p');
    paragraph.textContent = page.body_text;
    fragment.prepend(heading, paragraph);
    if (page.route === 'contact.htm') {
      const hours = document.createElement('p');
      hours.textContent = settings.hours;
      fragment.append(hours);
    }
  } else if (!fragment.childNodes.length) {
    const heading = document.createElement('h1');
    heading.textContent = page.title;
    fragment.append(heading);
  }
  if (page.route === 'index.html' && settings.features_custom) {
    fragment.replaceChildren();
    for (const feature of settings.features) {
      const listed = list.find((item) => item.route === feature);
      if (!listed) continue;
      const title = document.createElement('h2');
      const link = document.createElement('a');
      link.href = linkTo(feature);
      link.textContent = listed.title;
      title.append(link);
      fragment.append(title);
    }
    const hoursHeading = document.createElement('h2');
    hoursHeading.textContent = 'Gallery hours';
    const hours = document.createElement('p');
    hours.textContent = settings.hours;
    fragment.append(hoursHeading, hours);
  }
}

function enhanceLinks(fragment) {
  for (const anchor of fragment.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    if (href.startsWith('./') && /\.html?$/i.test(href)) {
      anchor.href = linkTo(decodeURIComponent(href.slice(2)));
    } else if (!['#', 'mailto:', 'tel:'].some((prefix) => href.startsWith(prefix))) {
      anchor.removeAttribute('href');
    }
  }
}

function displayCaption(work, item) {
  return (work.edited ? work.caption : item.caption || work.caption) || [work.artist, work.title].filter(Boolean).join('\n');
}

function addArtwork(fragment, page, works, assets, urlFor, detailsFor) {
  const slots = [...fragment.querySelectorAll('a[data-work]')];
  const newGrid = document.createElement('div');
  newGrid.className = 'new-artwork';
  const artworkMap = new Map(works.map((item) => [item.id, item]));
  const placements = page.placements || [];
  const isOriginalOrder = placements.length === slots.length && slots.every((slot, index) =>
    slot.dataset.work === placements[index].work_id || !placements[index].work_id);
  if (!isOriginalOrder) {
    for (const slot of slots) {
      const caption = slot.closest('td')?.querySelector('[data-art-caption]');
      caption?.remove();
      slot.remove();
    }
  }
  const entries = new Map();
  for (const [index, item] of placements.entries()) {
    const work = artworkMap.get(item.work_id);
    const slot = isOriginalOrder ? slots[index] : null;
    const caption = slot?.closest('td')?.querySelector('[data-art-caption]');
    if (!work) {
      caption?.remove();
      slot?.remove();
      continue;
    }
    const asset = assets.get(work.asset_id);
    const anchor = slot || document.createElement('a');
    const image = anchor.querySelector('img') || document.createElement('img');
    const text = work.title || 'View artwork';
    image.alt = text;
    image.loading = 'lazy';
    anchor.href = '#artwork';
    anchor.setAttribute('aria-label', text);
    if (!image.parentNode) anchor.append(image);
    applyImage(image, urlFor(asset?.thumbnail), 'Artwork preview unavailable');
    const display = displayCaption(work, item);
    entries.set(anchor, { asset, text, display, group: item.group || 'gallery' });
    if (!slot) {
      const tile = document.createElement('div');
      const description = document.createElement('p');
      description.textContent = [work.title, work.artist].filter(Boolean).join('\n');
      tile.append(anchor, description);
      newGrid.append(tile);
    }
    if (caption) {
      if (work.edited) caption.textContent = display;
      else caption.replaceChildren(safeContent(item.inline_html || ''));
    }
  }
  if (newGrid.childNodes.length) fragment.append(newGrid);
  for (const [anchor, item] of entries) {
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      lightboxTrigger = anchor;
      lightboxGroup = [...entries.values()].filter((entry) => entry.group === item.group);
      lightboxIndex = lightboxGroup.indexOf(item);
      if (!dialog.open) dialog.showModal();
      drawLightbox(detailsFor);
    });
  }
}

async function drawLightbox(detailsFor) {
  const version = ++lightboxRequest;
  const item = lightboxGroup[lightboxIndex];
  const image = dialog.querySelector('img');
  image.hidden = true;
  image.removeAttribute('src');
  image.alt = item.text;
  dialog.querySelector('[data-caption]').textContent = item.display;
  dialog.querySelector('[data-count]').textContent = `${lightboxIndex + 1} of ${lightboxGroup.length}`;
  dialog.querySelector('[data-prev]').disabled = lightboxIndex === 0;
  dialog.querySelector('[data-next]').disabled = lightboxIndex + 1 === lightboxGroup.length;
  const status = dialog.querySelector('[data-image-status]');
  status.textContent = 'Loading image…';
  let url;
  try { url = await detailsFor(item.asset?.detail); } catch {}
  if (version !== lightboxRequest || !dialog.open) return;
  if (!url) {
    status.textContent = 'Image unavailable.';
    return;
  }
  image.onerror = () => { image.hidden = true; status.textContent = 'Image unavailable.'; };
  image.src = url;
  image.hidden = false;
  status.textContent = '';
}

function wireLightbox(detailsFor) {
  const move = (direction) => {
    const next = lightboxIndex + direction;
    if (next < 0 || next >= lightboxGroup.length) return;
    lightboxIndex = next;
    drawLightbox(detailsFor);
  };
  dialog.querySelector('[data-prev]').onclick = () => move(-1);
  dialog.querySelector('[data-next]').onclick = () => move(1);
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => lightboxTrigger?.focus());
  dialog.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'p'].includes(event.key)) move(-1);
    if (['ArrowRight', 'n'].includes(event.key)) move(1);
  });
}

async function getData(staffClient) {
  if (EMMA_MODE === 'local' && source === 'local') {
    const file = Object.hasOwn(EMMA_PREVIEW_PATHS, route) ? EMMA_PREVIEW_PATHS[route] : null;
    if (!file) return {};
    const read = async (name) => {
      const response = await fetch('./page-data/' + name);
      if (!response.ok) throw new Error('Preview data could not load.');
      return response.json();
    };
    const [index, content] = await Promise.all([read('index.json'), read(file)]);
    return { ...index, ...content, urlFor: (name) => name ? './media/' + encodeURIComponent(name) : '' };
  }
  const { emmaClient, loadPage, signedImages, check } = await import('./store.mjs');
  const client = staffClient || emmaClient(source === 'staff');
  if (!staffClient && source === 'staff' && !check(await client.rpc('is_gallery_staff'))) throw new Error('Staff sign-in required.');
  const data = await loadPage(client, route, source === 'staff');
  const thumbs = new Set(data.works.map((item) => item.asset_id));
  const paths = data.assets.flatMap((item) => [
    thumbs.has(item.id) ? item.thumbnail : null,
    !thumbs.has(item.id) || item.id === data.settings?.logo || item.id === data.settings?.background ||
      data.page?.media_ids?.includes(item.id) ? item.detail : null
  ]);
  const images = signedImages(client, paths).catch(() => () => '');
  const urlFor = (file) => file ? images.then((resolve) => resolve(file)) : '';
  const detailsFor = async (file) => file ? (await signedImages(client, [file]))(file) : '';
  return { ...data, urlFor, detailsFor };
}

async function start(staffClient) {
  const { page, settings, list, works, assets, urlFor, detailsFor = urlFor } = await getData(staffClient);
  if (!settings || !page) {
    main.textContent = 'This page is unavailable.';
    return;
  }
  const assetMap = new Map(assets.map((item) => [item.id, item]));
  document.title = page.html_title;
  document.querySelector('.brand').textContent = settings.title;
  document.querySelector('.artists img').alt = settings.title;
  document.querySelector('.address').textContent = settings.address;
  for (const anchor of document.querySelectorAll('.masthead [data-route]')) {
    anchor.href = linkTo(anchor.dataset.route);
    if (anchor.dataset.route === route) anchor.setAttribute('aria-current', 'page');
  }
  const logo = urlFor(assetMap.get(settings.logo)?.detail);
  const background = urlFor(assetMap.get(settings.background)?.detail);
  Promise.resolve(logo).then((url) => {
    if (url) document.querySelector('.artists img').src = url;
    else document.querySelector('.artists img').hidden = true;
  });
  Promise.resolve(background).then((url) => {
    if (url) document.getElementById('gallery-background').src = url;
  });
  if (/^[a-z0-9]+$/i.test(settings.font_project || '')) {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://use.typekit.net/' + settings.font_project + '.css';
    document.head.append(font);
  }
  const artistNav = document.querySelector('.artists nav');
  for (const artist of list.filter((item) => item.kind === 'artist').sort((a, b) =>
    (a.roster_order ?? 999999) - (b.roster_order ?? 999999) || a.title.localeCompare(b.title))) {
    const link = document.createElement('a');
    link.href = linkTo(artist.route);
    link.textContent = artist.title;
    if (artist.route === route) link.setAttribute('aria-current', 'page');
    artistNav.append(link);
  }
  const content = safeContent(page.body);
  applyPageEdits(content, page, settings, list);
  applyHours(content, settings.hours);
  enhanceLinks(content);
  for (const [index, image] of [...content.querySelectorAll('img[data-asset]')].entries()) {
    if (page.route === 'index.html' && index === 0) {
      image.loading = 'eager';
      image.fetchPriority = 'high';
    }
    applyImage(image, urlFor(assetMap.get(image.dataset.asset)?.detail));
  }
  addArtwork(content, page, works, assetMap, urlFor, detailsFor);
  main.replaceChildren(content);
  wireLightbox(detailsFor);
}

const load = review ? import('./review.mjs').then(({ openReview }) => openReview(start)) : start();
load.catch((error) => {
  console.error(error);
  if (review) {
    document.querySelector('.review-signin [role=status]').textContent = 'The review could not load. Please reload and try again.';
    return;
  }
  main.textContent = source === 'staff' ? 'The staff preview could not load. Open the staff portal and check your sign-in.'
    : 'The gallery could not load. Please try again.';
});
