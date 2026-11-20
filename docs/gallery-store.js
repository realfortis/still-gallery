export const artworks = 'gallery_artworks';
export const bucket = 'gallery-artwork';

const columns = 'id,title,artist,medium,year,dimensions,description,alt_text,status,featured,image_path,sample_file,version';

export async function readGallery(client, { staff = false, id } = {}) {
  const limit = 200;
  const works = [];
  for (let offset = 0; ; offset += limit) {
    let query = client.from(artworks).select(columns);
    if (!staff) query = query.eq('status', 'published');
    if (id) query = query.eq('id', id);
    const { data, error } = await query.order('featured', { ascending: false })
      .order('id', { ascending: false }).range(offset, offset + limit - 1)
      .abortSignal(AbortSignal.timeout(12_000));
    if (error) throw error;
    works.push(...data);
    if (data.length < limit) return works;
  }
}

export async function artworkImages(client, works, projectUrl) {
  const images = new Map();
  const uploaded = [];
  for (const work of works) {
    if (work.sample_file) images.set(work.id, `./artwork/${encodeURIComponent(work.sample_file)}`);
    else if (work.image_path) uploaded.push(work);
  }
  if (uploaded.length) {
    const paths = uploaded.map((work) => work.image_path);
    const { data } = await client.storage.from(bucket).createSignedUrls(paths, 600);
    const signedByPath = new Map((data || []).map((entry) => [entry.path, entry.signedUrl]));
    const origin = new URL(projectUrl).origin;
    for (const work of uploaded) {
      const signed = signedByPath.get(work.image_path);
      if (signed && new URL(signed).origin === origin) images.set(work.id, signed);
    }
  }
  return (work) => images.get(work.id) || '';
}
