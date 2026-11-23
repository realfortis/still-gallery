export function pageHead({ title, css, script, supabase, review = false }) {
  const policy = [
    "default-src 'none'", "script-src 'self'", "style-src 'self' https://use.typekit.net https://p.typekit.net",
    "font-src 'self' https://use.typekit.net", `img-src 'self' blob: ${supabase.url} https://p.typekit.net`,
    `connect-src 'self' ${supabase.url}`, "base-uri 'none'", "form-action 'none'"
  ].join('; ');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${policy}">${review ? '\n<meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer">' : ''}
<title>${title}</title><link rel="stylesheet" href="./${css}">
<script type="module" src="./${script}"></script>
</head>`;
}

const menu = [
  ['Home', 'index.html'], ['About', 'about.htm'], ['Exhibitions', 'exhibitions.htm'],
  ['Services', 'services.htm'], ['Contact', 'contact.htm']
].map(([label, route]) => `<a href="./${route}" data-route="${route}">${label}</a>`).join(' <span aria-hidden="true">|</span> ');

export function visitorPage({ title, css, script, supabase, review = false }) {
  return `${pageHead({ title, css, script, supabase, review })}
<body>${review ? `<section class="review-signin" aria-labelledby="review-title">
<h1 id="review-title">Private site review</h1>
<p>Sign in with your existing staff account to view the site.</p>
<form method="post">
<label>Email<input type="email" name="email" autocomplete="username" required></label>
<label>Password<input type="password" name="password" autocomplete="current-password" required></label>
<button type="submit">Sign in to review</button>
</form>
<p role="status"></p>
</section>` : ''}${review ? '\n<div data-gallery hidden>' : ''}<img id="gallery-background" alt="">
<header class="masthead"><div class="masthead-in">
<p class="address"></p><a class="brand" href="./index.html" data-route="index.html">${review ? '' : title}</a>
<nav class="menu" aria-label="Main">${menu}</nav>
</div></header>
<div class="layout">
<aside class="artists"><img alt="${review ? '' : title}"><details open><summary>Artists</summary><nav aria-label="Artists"></nav></details></aside>
<main class="content" id="main"><p role="status">Loading gallery…</p></main>
</div>
<footer>${review ? '<button type="button" data-review-signout>Sign out</button>' :
  '<a href="./admin.html">Open staff portal</a>'}</footer>
<dialog class="lightbox" aria-label="Artwork viewer">
<img alt="" hidden><p data-image-status role="status"></p><p data-caption></p>
<nav aria-label="Artwork lightbox"><button type="button" data-prev>Previous</button><button type="button" data-next>Next</button>
<span data-count aria-live="polite"></span><button type="button" data-close autofocus>Close</button></nav>
</dialog>${review ? '</div>' : ''}</body></html>\n`;
}
