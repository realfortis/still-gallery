export function pageHead({ title, css, script, supabase, hosted = false }) {
  const policy = [
    "default-src 'none'", "script-src 'self'", "style-src 'self' https://use.typekit.net https://p.typekit.net",
    "font-src 'self' https://use.typekit.net", `img-src 'self' blob: ${supabase.url} https://p.typekit.net`,
    `connect-src 'self' ${supabase.url}`, "base-uri 'none'", "form-action 'none'"
  ].join('; ');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${policy}">${hosted ? '\n<meta name="robots" content="noindex, nofollow, noarchive"><meta name="referrer" content="no-referrer">' : ''}
<title>${title}</title><link rel="stylesheet" href="./${css}">
<script type="module" src="./${script}"></script>
</head>`;
}

export function adminPage({ title, css, script, supabase, hosted = false }) {
  return `${pageHead({ title: 'Staff sign-in · ' + title, css, script, supabase, hosted })}
<body><header class="top"><div class="wrap top-inner">
<a class="brand" href="${hosted ? './' : './index.html'}">${title}</a></div></header>
<main id="main" class="wrap admin"><p role="status">Loading staff portal…</p></main></body></html>\n`;
}

const menu = [
  ['Home', 'index.html'], ['About', 'about.htm'], ['Exhibitions', 'exhibitions.htm'],
  ['Services', 'services.htm'], ['Contact', 'contact.htm']
];

export function visitorPage({ title, css, script, supabase, hosted = false }) {
  const navigation = menu.map(([label, route]) => {
    const href = hosted ? (route === 'index.html' ? './' : './?page=' + route) : './' + route;
    return `<a href="${href}" data-route="${route}">${label}</a>`;
  }).join(' <span aria-hidden="true">|</span> ');
  return `${pageHead({ title, css, script, supabase, hosted })}
<body><img id="gallery-background" alt="">
<header class="masthead"><div class="masthead-in">
<p class="address"></p><span class="brand">${hosted ? '' : title}</span>
<nav class="menu" aria-label="Main">${navigation}</nav>
</div></header>
<div class="layout">
<aside class="artists"><img alt="${hosted ? '' : title}"><details open><summary>Artists</summary><nav aria-label="Artists"></nav></details></aside>
<main class="content" id="main"><p role="status">Loading gallery…</p></main>
</div>
<footer><a href="./admin.html">${hosted ? 'Staff sign-in' : 'Open staff portal'}</a></footer>
<dialog class="lightbox" aria-label="Artwork viewer">
<img alt="" hidden><p data-image-status role="status"></p><p data-caption></p>
<nav aria-label="Artwork lightbox"><button type="button" data-prev>Previous</button><button type="button" data-next>Next</button>
<span data-count aria-live="polite"></span><button type="button" data-close autofocus>Close</button></nav>
</dialog></body></html>\n`;
}
