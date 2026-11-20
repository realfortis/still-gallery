import { catalogContent, detailContent } from './catalog-view.js';
import { catalogData, pagesLinks } from './catalog.js';
import { backendOrigin, supabase } from './config.js';
import { exampleWorks } from './examples.js';

const main = document.querySelector('main');
const links = pagesLinks(backendOrigin);
const clearFilters = './#collection';
const params = new URLSearchParams(window.location.search);
const live = Boolean(backendOrigin || supabase);
const detailPage = window.location.pathname.endsWith('/artwork.html');

async function loadGallery() {
  let works;
  let galleryLinks = links;
  let error = '';
  try {
    if (supabase) {
      const [{ galleryClient }, { readGallery, artworkImages }] = await Promise.all([
        import('./supabase-client.js'), import('./gallery-store.js')
      ]);
      const client = galleryClient(supabase);
      const id = params.get('id');
      works = detailPage && !/^[1-9][0-9]{0,9}$/.test(id || '') ? []
        : await readGallery(client, { id: detailPage ? id : null });
      galleryLinks = { ...links, image: await artworkImages(client, works, supabase.url) };
    } else if (backendOrigin) {
      const response = await fetch(`${backendOrigin}/api/artworks`, {
        cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) throw new Error('Catalog unavailable');
      ({ works } = await response.json());
      if (!Array.isArray(works)) throw new Error('Invalid catalog');
    } else {
      works = [...exampleWorks].sort((a, b) => b.featured - a.featured || b.id - a.id);
    }
  } catch {
    works = [];
    error = 'The collection is temporarily unavailable. Please try again shortly.';
  }

  if (detailPage) {
    const work = works.find(({ id }) => String(id) === params.get('id'));
    if (work) {
      main.innerHTML = detailContent(work, { links: galleryLinks, clearFilters });
      document.title = `${work.title} · Sill Gallery`;
    } else {
      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      status.textContent = error || 'This artwork is unavailable.';
      const back = document.createElement('a');
      back.className = 'back';
      back.href = clearFilters;
      back.textContent = 'Back to the collection';
      const section = document.createElement('section');
      section.className = 'wrap detail';
      section.append(back, status);
      main.replaceChildren(section);
      document.title = 'Artwork · Sill Gallery';
    }
  } else if (live || window.location.search) {
    main.innerHTML = catalogContent({ ...catalogData(works, params), links: galleryLinks, clearFilters, message: error });
    if (window.location.hash === '#collection' || window.location.hash === '#visit') {
      document.getElementById(window.location.hash.slice(1)).scrollIntoView();
    }
  }
}

loadGallery();
window.addEventListener('pageshow', (event) => {
  if (event.persisted && live) loadGallery();
});
