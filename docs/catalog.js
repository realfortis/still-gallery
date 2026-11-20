export function catalogData(works, params = new URLSearchParams()) {
  const query = (params.get('q') || '').trim().slice(0, 120);
  const medium = (params.get('medium') || '').slice(0, 80);
  const term = query.toLowerCase();
  const media = [...new Set(works.map((work) => work.medium))].sort((a, b) => a.localeCompare(b));
  return {
    featured: works.find((work) => work.featured),
    media: media.map((name) => ({ medium: name })),
    query,
    medium,
    works: works.filter((work) => (!medium || work.medium === medium) &&
      (work.title.toLowerCase().includes(term) || work.artist.toLowerCase().includes(term)))
  };
}

export function pagesLinks(backendOrigin) {
  return {
    detail: (work) => `./artwork.html?id=${encodeURIComponent(work.id)}`,
    image: (work) => backendOrigin
      ? `${backendOrigin}/image/${encodeURIComponent(work.id)}?v=${encodeURIComponent(work.image_revision)}`
      : `./artwork/${encodeURIComponent(work.file)}`
  };
}
