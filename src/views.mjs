import { escape as e, imagePath, catalogContent, detailContent } from './catalog-view.mjs';

const serverLinks = { image: (work) => imagePath(work), detail: (work) => `/artwork/${work.id}` };
const logo = (home) => `<a class="brand" href="${e(home)}" aria-label="Sill Gallery home"><span class="mark" aria-hidden="true"></span><span>Sill<span class="brand-gap">Gallery</span></span></a>`;

export function layout(title, main, admin = false, pages) {
  const home = pages ? './' : '/';
  const script = pages?.script || './gallery.js';
  const staff = pages ? pages.staff : '/admin';
  const stylesheet = pages ? './site.css' : '/site.css';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)} · Sill Gallery</title>
  <link rel="stylesheet" href="${stylesheet}">
  ${pages ? `<script type="module" src="${e(script)}"></script>` : ''}
</head>
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="top"><div class="wrap top-inner">
    ${logo(home)}
    <nav aria-label="Main"><a href="${e(home)}#collection">Collection</a><a href="${e(home)}#visit">Visit</a></nav>
  </div></header>
  <main id="main" ${admin ? 'class="wrap admin"' : ''}>${main}</main>
  <footer><div class="wrap footer-inner">
    <span>Sill Gallery <span class="muted">· Fictional gallery demo</span></span>
    ${staff ? `<a href="${e(staff)}">Staff sign-in</a>` : '<span class="muted">Staff portal awaiting setup</span>'}
  </div></footer>
</body>
</html>`;
}

export function home(data, pages) {
  return layout('Contemporary art', catalogContent({
    links: serverLinks, ...data
  }), false, pages);
}

export function detail(work) {
  return layout(work.title, detailContent(work, { links: serverLinks }));
}

export function pagesDetail(pages) {
  return layout('Artwork', `<section class="wrap detail">
    <a class="back" href="./#collection">Back to the collection</a>
    <p role="status">Loading artwork…</p>
    <noscript>Enable JavaScript to view this artwork.</noscript>
  </section>`, false, pages);
}

export function pagesAdmin(pages) {
  return layout('Gallery administration', '<p role="status">Loading staff portal…</p>', true,
    { ...pages, script: './admin.js' });
}

export function login(error, email) {
  return layout('Staff sign-in', loginContent(error, email), true);
}

export function loginContent(error = '', email = '', action = '/admin/login') {
  return `
    <div class="login panel">
      <p class="eyebrow"><span></span> Gallery administration</p>
      <h1>Staff sign-in</h1>
      ${error ? `<p class="alert" role="alert">${e(error)}</p>` : ''}
      <form method="post" action="${e(action)}" class="stack">
        <label>Email<input type="email" name="email" value="${e(email)}" maxlength="254" autocomplete="username" required></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
        <button class="button primary">Sign in</button>
      </form>
    </div>`;
}

const serverAdminLinks = {
  dashboard: '/admin', edit: (id) => `/admin/artwork/${id}`,
  image: (work) => imagePath(work, true), logout: '/admin/logout'
};

function csrfInput(session) {
  return session ? `<input type="hidden" name="csrf" value="${e(session.csrf)}">` : '';
}

export function dashboard(works, session, message) {
  return layout('Manage artwork', dashboardContent(works, session, message), true);
}

export function dashboardContent(works, session, message, links = serverAdminLinks, error = '') {
  return `
    <div class="admin-heading">
      <div><p class="eyebrow"><span></span> Gallery administration</p><h1>Manage artwork</h1></div>
      <div class="toolbar">
        <a class="button primary" href="${e(links.edit('new'))}">Add artwork</a>
        <form method="post" action="${e(links.logout)}">
          ${csrfInput(session)}
          <button class="button secondary">Sign out</button>
        </form>
      </div>
    </div>
    ${error ? `<p class="alert" role="alert">${e(error)}</p>` : ''}
    ${message ? `<p class="notice" role="status">${e(message)}</p>` : ''}
    ${works.length ? `<ul class="work-list">${works.map((work) => `
      <li>${links.image(work) ? `<img src="${e(links.image(work))}" alt="" loading="lazy">` : '<span></span>'}
        <div><strong>${e(work.title)}</strong><br><span class="muted">${e(work.artist)}</span></div>
        <span class="state ${e(work.status)}">${work.status === 'published' ? 'Published' : 'Draft'}${work.featured ? ' · Featured' : ''}</span>
        <a class="button secondary" href="${e(links.edit(work.id))}" aria-label="Edit ${e(work.title)}">Edit</a>
      </li>`).join('')}</ul>` : '<p class="panel">The catalog is empty. Add an artwork to get started.</p>'}`;
}

export function editor(work, session, options) {
  return layout(work ? 'Edit artwork' : 'Add artwork', editorContent(work, session, options), true);
}

export function editorContent(work, session, {
  error = '', values = work || {}, links = serverAdminLinks
} = {}) {
  const edit = Boolean(work);
  const title = edit ? 'Edit artwork' : 'Add artwork';
  const action = links.edit(work?.id || 'new');
  const field = (name, label, max, required = false) =>
    `<label>${label}<input name="${name}" value="${e(values[name])}" maxlength="${max}" ${required ? 'required' : ''}></label>`;

  return `
    <a class="back" href="${e(links.dashboard)}">Back to artwork</a>
    <div class="admin-heading"><h1>${title}</h1></div>
    ${error ? `<p class="alert" role="alert">${e(error)}</p>` : ''}
    <form method="post" action="${e(action)}" enctype="multipart/form-data" class="editor">
      ${csrfInput(session)}
      <div class="panel stack">
        ${field('title', 'Title', 120, true)}
        ${field('artist', 'Artist', 120, true)}
        <div class="field-row">${field('medium', 'Medium', 80, true)}${field('year', 'Year', 20)}</div>
        ${field('dimensions', 'Dimensions', 80)}
        <label>Description<textarea name="description" rows="5" maxlength="2000">${e(values.description)}</textarea></label>
      </div>
      <div class="panel stack">
        ${edit && links.image(work) ? `<img class="edit-image" src="${e(links.image(work))}" alt="${e(work.alt_text)}">` : ''}
        <label>${edit ? 'Replace image' : 'Artwork image'}<input name="image" type="file" accept="image/jpeg,image/png,image/webp" ${edit ? '' : 'required'}>
          <span class="muted help">JPEG, PNG or WebP. Up to 6 MB.</span></label>
        ${field('alt_text', 'Image description for screen readers', 240, true)}
        <label>Visibility<select name="status">
          <option value="draft">Draft</option>
          <option value="published"${values.status === 'published' ? ' selected' : ''}>Published</option>
        </select></label>
        <label class="check"><input type="checkbox" name="featured" value="yes"${values.featured ? ' checked' : ''}> Feature on the homepage when published</label>
        <button class="button primary">Save artwork</button>
      </div>
    </form>
    ${edit ? `<details class="remove">
      <summary>Delete artwork</summary>
      <p>This permanently removes the record and its image.</p>
      <form method="post" action="${e(links.delete ? links.delete(work.id) : action + '/delete')}">
        ${csrfInput(session)}
        <button class="button danger">Permanently delete artwork</button>
      </form>
    </details>` : ''}`;
}

export function errorPage(title, message) {
  return layout(title, `<section class="wrap error-page"><h1>${e(title)}</h1><p>${e(message)}</p><a href="/">Gallery home</a></section>`);
}
