"""Capture the approved public baseline into a private workspace directory."""
import concurrent.futures
import hashlib
import io
import json
import re
import sys
import time
import uuid
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit, quote
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from bs4 import BeautifulSoup
from PIL import Image, ImageOps

BASE = 'https://www.emmabutler.com/'
HOSTS = {'emmabutler.com', 'www.emmabutler.com'}
MAIN = {'index.html', 'about.htm', 'exhibitions.htm', 'services.htm', 'contact.htm'}
ROOT = Path(sys.argv[1]).resolve()
ROOT.mkdir(parents=True, exist_ok=True)
MEDIA = ROOT / 'media'
MEDIA.mkdir(exist_ok=True)
issues = []
assets = {}
works = {}


def normalize(value, route=''):
    url = urlsplit(urljoin(BASE + route, value))
    if url.scheme != 'https' or url.hostname not in HOSTS:
        return None
    path = unquote(url.path).lstrip('/')
    return path if path and '..' not in Path(path).parts else None


def fetch(path):
    req = Request(BASE + quote(path, safe='/'), headers={'User-Agent': 'Emma Butler Gallery authorized migration audit'})
    for attempt in range(2):
        try:
            with urlopen(req, timeout=15) as response:
                if urlsplit(response.url).hostname not in HOSTS:
                    raise ValueError('Unexpected redirect')
                data = response.read(18 * 1024 * 1024 + 1)
                if len(data) > 18 * 1024 * 1024:
                    raise ValueError('Source file exceeds 18 MiB')
                return data
        except (OSError, ValueError):
            if attempt:
                raise
            time.sleep(0.3)


def read_page(route):
    return BeautifulSoup(fetch(route), 'html.parser')


def asset(path, kind='artwork'):
    value = assets.setdefault(path, {
        'id': str(uuid.uuid5(uuid.NAMESPACE_URL, BASE + quote(path, safe='/'))),
        'source': path,
        'kind': kind
    })
    if kind == 'site':
        value['kind'] = 'site'
    return value['id']


def find_routes(doc, route):
    return {path for a in doc.find_all('a', href=True)
            if (path := normalize(a['href'], route)) and re.fullmatch(r'[\w.-]+\.html?', path, re.I)}


def text(value):
    return re.sub(r'\s+', ' ', value or '').strip()


def download(entry):
    try:
        detail = MEDIA / (entry['id'] + '.webp')
        thumb = MEDIA / (entry['id'] + '-thumb.webp')
        fingerprint = detail.with_suffix('.sha256')
        if detail.exists() and thumb.exists() and fingerprint.exists():
            return dict(entry, detail=detail.name, thumb=thumb.name, sha256=fingerprint.read_text().splitlines()[0],
                        used_source=fingerprint.read_text().splitlines()[-1] if '\n' in fingerprint.read_text() else entry['source'],
                        bytes=detail.stat().st_size + thumb.stat().st_size)
        used_source = entry['source']
        try:
            data = fetch(used_source)
            probe = Image.open(io.BytesIO(data))
            probe.close()
        except (OSError, ValueError):
            used_source = entry.get('fallback')
            if not used_source:
                raise
            data = fetch(used_source)
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image)
            image = image.convert('RGBA' if 'A' in image.getbands() or 'transparency' in image.info else 'RGB')
            preview = image.copy()
            preview.thumbnail((520, 520), Image.Resampling.LANCZOS)
            image.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
            preview.save(thumb, 'WEBP', quality=80, method=4)
            image.save(detail, 'WEBP', quality=84, method=4)
        digest = hashlib.sha256(data).hexdigest()
        fingerprint.write_text(digest + '\n' + used_source)
        return dict(entry, detail=detail.name, thumb=thumb.name, sha256=digest, used_source=used_source,
                    bytes=detail.stat().st_size + thumb.stat().st_size)
    except Exception as error:
        return dict(entry, error=str(error))


def run():
    sitemap = ElementTree.fromstring(fetch('sitemap.xml'))
    pending = {'index.html'} | {path for node in sitemap.findall('.//{*}loc')
                                if (path := normalize(node.text))}
    documents = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        while pending:
            batch = sorted(pending)
            pending.clear()
            for route, future in zip(batch, [pool.submit(read_page, r) for r in batch]):
                try:
                    documents[route] = future.result()
                    pending.update(find_routes(documents[route], route))
                except Exception as error:
                    issues.append({'kind': 'page unavailable', 'route': route, 'detail': str(error)})
                    documents[route] = None
            pending.difference_update(documents)
    home = documents['index.html']
    roster = {normalize(a['href']): text(a.get_text()) for a in home.select('.artists a[href]')}
    pages = []
    features = []
    for route, doc in documents.items():
        if doc is None:
            continue
        content = doc.select_one('.content')
        if content is None:
            issues.append({'kind': 'missing body', 'route': route})
            continue
        title_text = text(doc.title.get_text()) if doc.title else 'Emma Butler Gallery'
        heading = content.find(['h1', 'h2'])
        label = roster.get(route) or (text(heading.get_text(' ')) if heading else title_text)
        kind = ('artist' if route in roster else 'page' if route in MAIN else
                'historical' if route == 'historical.htm' else 'exhibition')
        for tag in content.select('script, iframe, object, embed, form, style, svg, video, audio, link'):
            tag.decompose()
        for tag in content.find_all(True):
            for name in list(tag.attrs):
                if name.startswith('on') or name in ('srcset', 'style', 'target'):
                    del tag.attrs[name]
        for img in content.select('img[src]'):
            img['loading'] = 'lazy'
            img.attrs.setdefault('alt', '')
        if route in ('index.html', 'contact.htm'):
            for tag in content.find_all(['h2', 'h3']):
                if text(tag.get_text()).lower() == 'gallery hours':
                    following = tag.find_next_sibling('p')
                    if following:
                        following['data-gallery-hours'] = 'true'
        placements = []
        for a in content.select('a[href]'):
            href = a['href']
            path = normalize(href, route)
            if 'lightbox' not in ' '.join(a.get('rel', [])).lower() or not path:
                if path and re.fullmatch(r'[\w.-]+\.html?', path, re.I):
                    a['href'] = './' + quote(path)
                elif href.startswith(('#', 'mailto:', 'tel:')):
                    pass
                elif not path:
                    a.attrs.pop('href', None)
                    issues.append({'kind': 'unmapped link', 'route': route, 'value': href})
                continue
            image_id = asset(path)
            rich = BeautifulSoup(a.get('title', ''), 'html.parser')
            for br in rich.find_all('br'):
                br.replace_with('\n')
            lines = [line for value in rich.get_text('\n').splitlines() if (line := text(value))]
            emphasis = rich.find(['i', 'em'])
            title = text(emphasis.get_text(' ')) if emphasis else (lines[1] if len(lines) > 1 else '')
            artist = roster.get(route) or (lines[0] if len(lines) > 1 and lines[0] != title else '')
            work = works.setdefault(image_id, {'id': image_id, 'asset_id': image_id, 'title': title,
                                                'artist': artist, 'caption': '\n'.join(lines),
                                                'sources': []})
            cell = a.find_parent('td')
            caption = cell.find('p') if cell and len(cell.select('a[rel]')) == 1 else None
            inline = text(caption.get_text(' ')) if caption else ''
            inline_html = caption.decode_contents() if caption else ''
            if caption:
                caption.clear()
                caption['data-art-caption'] = 'true'
                details = lambda val: {re.sub(r'\s', '', item).lower()
                                       for item in re.findall(r'\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?', val, re.I)}
                if details(inline) and details(' '.join(lines)) and details(inline).isdisjoint(details(' '.join(lines))):
                    issues.append({'kind': 'caption dimensions disagree', 'route': route,
                                   'image': path, 'page_caption': inline, 'lightbox_caption': '\n'.join(lines)})
            work['sources'].append({'route': route, 'caption': '\n'.join(lines), 'inline': inline})
            group = ' '.join(a.get('rel', []))
            a.attrs = {'href': '#', 'data-work': image_id, 'data-group': group}
            for img in a.find_all('img'):
                src = img.attrs.pop('src', None)
                candidate = normalize(src, route) if src else None
                if candidate and candidate != path:
                    assets[path].setdefault('fallback', candidate)
                img['alt'] = ''
            placements.append({'work_id': image_id, 'caption': '\n'.join(lines), 'inline_html': inline_html, 'group': group})
        media_ids = []
        for img in content.select('img[src]'):
            src = img.attrs.pop('src')
            path = normalize(src, route)
            if path:
                img['data-asset'] = asset(path, 'site')
                media_ids.append(img['data-asset'])
            else:
                issues.append({'kind': 'unmapped image', 'route': route, 'value': src})
        if route == 'index.html':
            for a in content.select('a[href]'):
                if a.find('img') and a.get('href', '').startswith('./'):
                    features.append(a['href'][2:])
        pages.append({'route': route, 'kind': kind, 'title': label, 'html_title': title_text,
                      'body': content.decode_contents(), 'roster_order': list(roster).index(route) if route in roster else None,
                      'placements': placements, 'media_ids': sorted(set(media_ids))})
    for key, path in [('logo', 'images/logo.png'), ('background', 'images/bg.jpg')]:
        asset(path, 'site')
    print(f'Captured {len(pages)} pages, {len(works)} artwork paths and {len(assets)} total image sources.', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        files = []
        for count, result in enumerate(pool.map(download, assets.values()), 1):
            files.append(result)
            if 'error' in result:
                issues.append({'kind': 'image unavailable', 'image': result['source'], 'detail': result['error']})
            if result.get('used_source') and result['used_source'] != result['source']:
                issues.append({'kind': 'thumbnail used because larger image is unavailable',
                               'image': result['source'], 'thumbnail': result['used_source']})
            if count % 100 == 0:
                print(f'Processed {count}/{len(assets)} image sources.', flush=True)
    for work in works.values():
        if not work['title'] or not work['artist']:
            issues.append({'kind': 'unverified metadata', 'image': work['id'], 'routes': [s['route'] for s in work['sources']]})
        values = {s['caption'] for s in work['sources']}
        if len(values) > 1:
            issues.append({'kind': 'different captions across pages', 'image': work['id'], 'values': sorted(values)})
    by_hash = {}
    for file in files:
        if file.get('sha256'):
            by_hash.setdefault(file['sha256'], []).append(file['source'])
    issues.extend({'kind': 'same image bytes at multiple paths', 'paths': paths}
                  for paths in by_hash.values() if len(paths) > 1)
    settings = {'title': 'Emma Butler Gallery',
                'address': "111 GEORGE ST WEST | ST. JOHN'S NL | CANADA | A1C 6K2 | 709 739-7111 | emmabutlergallery@nl.rogers.com",
                'hours': 'Tues-Sat\n11am-4pm\nor by appointment',
                'logo': assets['images/logo.png']['id'], 'background': assets['images/bg.jpg']['id'],
                'font_project': '', 'features': features}
    snapshot = {'pages': pages, 'artworks': list(works.values()), 'assets': files, 'settings': settings}
    (ROOT / 'preview.json').write_text(json.dumps(snapshot, ensure_ascii=False))
    totals = {'reachable_pages': len(pages) + 1, 'artist_pages': len(roster),
              'artwork_placements': sum(len(p['placements']) for p in pages),
              'artwork_image_paths': len(works), 'total_images': len(files),
              'downloaded_images': sum('error' not in file for file in files),
              'web_image_bytes': sum(file.get('bytes', 0) for file in files),
              'issue_counts': {kind: sum(item['kind'] == kind for item in issues) for kind in sorted({i['kind'] for i in issues})}}
    (ROOT / 'reconciliation.json').write_text(json.dumps({'totals': totals, 'issues': issues}, indent=2, ensure_ascii=False))
    print(json.dumps(totals, indent=2), flush=True)


if __name__ == '__main__':
    run()
