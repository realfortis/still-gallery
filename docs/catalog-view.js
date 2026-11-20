export function escape(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

const e = escape;
export const imagePath = (work, preview = false) =>
  `${preview ? '/admin' : ''}/image/${work.id}?v=${work.image_revision}`;
const artworkMeta = (work) => [work.medium, work.year, work.dimensions].filter(Boolean).map(e).join(' · ');
export function catalogContent({
  featured, works, media, query = '', medium = '', links, message = '', clearFilters = '/#collection'
}) {
  return `
    <section class="hero wrap">
      <div class="hero-copy">
        <p class="eyebrow"><span></span> Independent contemporary gallery</p>
        <h1>Art at the<br>water’s edge.</h1>
        <p>Paintings and objects shaped by coastal places, changing light, and the materials artists live with.</p>
        <a class="button primary" href="#collection">Explore the collection</a>
      </div>
      ${featured ? `<figure class="hero-figure">
        <a href="${e(links.detail(featured))}" aria-label="View ${e(featured.title)}">
          <img src="${e(links.image(featured))}" alt="${e(featured.alt_text)}" fetchpriority="high">
        </a>
        <figcaption><span><i>${e(featured.title)}</i> · ${e(featured.artist)}</span><span>Featured work</span></figcaption>
      </figure>` : ''}
    </section>
    <section id="collection" class="collection"><div class="wrap">
      <div class="collection-heading">
        <div><p class="eyebrow"><span></span> The collection</p><h2>Works on view</h2></div>
        <form class="filters" action="${e(clearFilters)}">
          <label><span class="sr-only">Search artwork</span><input type="search" name="q" placeholder="Search title or artist" value="${e(query)}" maxlength="120"></label>
          <label><span class="sr-only">Filter by medium</span><select name="medium">
            <option value="">All media</option>
            ${media.map(({ medium: option }) => `<option${option === medium ? ' selected' : ''}>${e(option)}</option>`).join('')}
          </select></label>
          <button class="button secondary" type="submit">Apply</button>
        </form>
      </div>
      ${message ? `<p role="status">${e(message)}</p>` : works.length ? `<div class="art-grid">${works.map((work) => `
        <article class="art-card">
          <a href="${e(links.detail(work))}">
            <img src="${e(links.image(work))}" alt="${e(work.alt_text)}" loading="lazy">
            <h3>${e(work.title)}</h3>
          </a>
          <p>${e(work.artist)} <span class="muted">· ${e(work.medium)}</span></p>
        </article>`).join('')}</div>` :
        `<p>${query || medium ? `No artworks match these filters. <a href="${e(clearFilters)}">Clear filters</a>` : 'New work will appear here when it is published.'}</p>`}
    </div></section>
    <section id="visit" class="visit wrap">
      <div><p class="eyebrow"><span></span> Visit the gallery</p><h2>By the harbour</h2></div>
      <div><p>Sill Gallery is a fictional independent gallery set in St. John’s, Newfoundland. The artists, artwork and visiting details are examples for this starter site.</p>
      <p><strong>Example hours</strong><br>Thursday–Sunday, noon–5 p.m.</p></div>
    </section>`;
}

export function detailContent(work, { links, clearFilters = '/#collection' }) {
  return `
    <section class="wrap detail">
      <a class="back" href="${e(clearFilters)}">Back to the collection</a>
      <div class="detail-grid">
        <img src="${e(links.image(work))}" alt="${e(work.alt_text)}">
        <div><p class="eyebrow"><span></span> ${e(work.artist)}</p><h1>${e(work.title)}</h1>
        <p class="muted">${artworkMeta(work)}</p>
        ${work.description ? `<p class="description">${e(work.description)}</p>` : ''}</div>
      </div>
    </section>`;
}
