import DOMPurify from 'dompurify';

const main = document.querySelector('main');
const dialog = document.querySelector('dialog');
const params = new URLSearchParams(location.search);
const currentPath = decodeURIComponent(location.pathname.split('/').pop() || 'index.html');
const hosted = EMMA_MODE === 'hosted';
const initialRoute = hosted || currentPath === 'entry.html' ? (params.get('page') || 'index.html') : currentPath;
const source = !hosted && params.has('preview') ? 'staff' : EMMA_MODE === 'local' ? 'local' : 'public';
const legacyPaths = new Set(EMMA_LEGACY_PATHS);
const masthead = document.querySelector('.masthead');
const artistNav = document.querySelector('.artists nav');
const logo = document.querySelector('.artists img');
const background = document.getElementById('gallery-background');
let artistList = '';
let fontLink;
let nextPageRequest = 0;
let lightboxGroup = [];
let lightboxIndex = 0;
let lightboxTrigger;
let lightboxDetailsFor;
let lightboxRequest = 0;

function linkTo(page) {
  if (hosted) return page === 'index.html' ? './' : './?page=' + encodeURIComponent(page);
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
      lightboxDetailsFor = detailsFor;
      if (!dialog.open) dialog.showModal();
      drawLightbox();
    });
  }
}

async function drawLightbox() {
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
  try { url = await lightboxDetailsFor(item.asset?.detail); } catch {}
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

function wireLightbox() {
  const move = (direction) => {
    const next = lightboxIndex + direction;
    if (next < 0 || next >= lightboxGroup.length) return;
    lightboxIndex = next;
    drawLightbox();
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

async function getData(route) {
  if (EMMA_MODE === 'local' && source === 'local') {
    const file = Object.hasOwn(EMMA_PREVIEW_PATHS, route) ? EMMA_PREVIEW_PATHS[route] : null;
    if (!file) return {};
    const read = async (name) => {
      const response = await fetch('./page-data/' + name);
      if (!response.ok) throw new Error('Preview data could not load.');
      return response.json();
    };
    const [index, content] = await Promise.all([read('index.json'), read(file)]);
    const urlFor = (name) => name ? './media/' + encodeURIComponent(name) : '';
    return { ...index, ...content, urlFor, sharedImageUrls: () => urlFor };
  }
  const { emmaClient, loadPage, signedImages, check } = await import('./store.mjs');
  const client = emmaClient(source === 'staff');
  if (source === 'staff' && !check(await client.rpc('is_gallery_staff'))) throw new Error('Staff sign-in required.');
  const data = await loadPage(client, route, source === 'staff');
  const thumbs = new Set(data.works.map((item) => item.asset_id));
  const pageImages = new Set(data.page?.media_ids);
  const paths = data.assets.flatMap((item) => [
    thumbs.has(item.id) ? item.thumbnail : null,
    pageImages.has(item.id) ? item.detail : null
  ]);
  const images = signedImages(client, paths).catch(() => () => '');
  const urlFor = (file) => file ? images.then((resolve) => resolve(file)) : '';
  const detailsFor = async (file) => file ? (await signedImages(client, [file]))(file) : '';
  const sharedImageUrls = (files) => signedImages(client, files).catch(() => () => '');
  return { ...data, urlFor, detailsFor, sharedImageUrls };
}

function updateBrandImages(settings, assets, sharedImageUrls) {
  const changes = new Map();
  for (const [image, id] of [[logo, settings.logo], [background, settings.background]]) {
    const file = assets.get(id)?.detail || '';
    if (image.dataset.file === file) continue;
    image.dataset.file = file;
    if (file) changes.set(image, file);
    else image.removeAttribute('src');
  }
  if (!changes.size) return;
  Promise.resolve(sharedImageUrls([...changes.values()])).then((resolve) => {
    for (const [image, file] of changes) {
      if (image.dataset.file !== file) continue;
      const url = resolve(file);
      if (url) image.src = url;
      else delete image.dataset.file;
    }
  });
}

function updateShell(settings, list, assets, sharedImageUrls) {
  masthead.hidden = false;
  document.querySelector('.brand').textContent = settings.title;
  logo.alt = settings.title;
  document.querySelector('.address').textContent = settings.address;
  updateBrandImages(settings, assets, sharedImageUrls);
  const project = settings.font_project || '';
  if (/^[a-z0-9]+$/i.test(project)) {
    const href = 'https://use.typekit.net/' + project + '.css';
    if (!fontLink) {
      fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = href;
      document.head.append(fontLink);
    } else if (fontLink.href !== href) fontLink.href = href;
  } else if (fontLink) {
    fontLink.remove();
    fontLink = undefined;
  }
  const artists = list.filter((item) => item.kind === 'artist').sort((a, b) =>
    (a.roster_order ?? 999999) - (b.roster_order ?? 999999) || a.title.localeCompare(b.title));
  const key = JSON.stringify(artists);
  if (artistList === key) return;
  artistList = key;
  for (const anchor of masthead.querySelectorAll('[data-route]')) {
    anchor.href = linkTo(anchor.dataset.route);
  }
  artistNav.replaceChildren(...artists.map((artist) => {
    const link = document.createElement('a');
    link.href = linkTo(artist.route);
    link.dataset.route = artist.route;
    link.textContent = artist.title;
    return link;
  }));
}

function markCurrentPage(route) {
  for (const menu of [masthead, artistNav]) {
    for (const anchor of menu.querySelectorAll('[data-route]')) {
      if (anchor.dataset.route === route) anchor.setAttribute('aria-current', 'page');
      else anchor.removeAttribute('aria-current');
    }
  }
}

function renderPage(route, { page, settings, list, works, assets, urlFor, detailsFor = urlFor, sharedImageUrls }) {
  if (!settings || !page) {
    markCurrentPage(route);
    main.textContent = settings ? 'This page is unavailable.' : 'This gallery is currently unavailable.';
    document.title = 'Gallery';
    if (hosted && !settings) {
      masthead.hidden = true;
      artistNav.replaceChildren();
      artistList = '';
      updateBrandImages({}, new Map(), sharedImageUrls);
    }
    return;
  }
  const assetMap = new Map(assets.map((item) => [item.id, item]));
  document.title = page.html_title;
  updateShell(settings, list, assetMap, sharedImageUrls);
  markCurrentPage(route);
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
}

async function loadRoute(route, scrollTop) {
  const request = ++nextPageRequest;
  main.setAttribute('aria-busy', 'true');
  if (dialog.open) dialog.close();
  lightboxTrigger = undefined;
  try {
    const data = await getData(route);
    if (request !== nextPageRequest) return;
    if (dialog.open) dialog.close();
    lightboxTrigger = undefined;
    renderPage(route, data);
  } catch (error) {
    if (request !== nextPageRequest) return;
    console.error(error);
    markCurrentPage(route);
    main.textContent = source === 'staff' ? 'The staff preview could not load. Open the staff portal and check your sign-in.'
      : 'The gallery could not load. Please try again.';
  }
  main.removeAttribute('aria-busy');
  if (scrollTop !== undefined) {
    main.focus({ preventScroll: true });
    window.scrollTo(0, scrollTop);
  }
}

function wireNavigation() {
  const base = new URL('./', location.href);
  const scrollPositions = new Map();
  let address = location.href;
  let activeRoute = initialRoute;
  main.tabIndex = -1;
  history.scrollRestoration = 'manual';

  function navigate(url, push) {
    const route = url.searchParams.get('page') || 'index.html';
    if (route === activeRoute) return;
    scrollPositions.set(address, scrollY);
    if (push) history.pushState(null, '', url);
    address = url.href;
    activeRoute = route;
    loadRoute(route, push ? 0 : scrollPositions.get(address) || 0);
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('target') || link.hasAttribute('download')) return;
    const url = new URL(link.href);
    if (url.origin !== base.origin || url.hash ||
        (url.pathname !== base.pathname && url.pathname !== base.pathname + 'index.html')) return;
    event.preventDefault();
    navigate(url, true);
  });
  window.addEventListener('popstate', () => navigate(new URL(location.href), false));
}

wireLightbox();
if (hosted) wireNavigation();
loadRoute(initialRoute);
