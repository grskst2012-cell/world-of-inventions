// Exhibit photos are stored in the project, in public/exhibits/<id>.jpg (full size,
// at most 1000 px wide) and public/exhibits/thumb/<id>.jpg (400 px). The site serves
// them itself and the bot uploads the same files to Telegram, so neither depends on a
// remote link staying alive.
//
// This script:
//   1. downloads the photo for every exhibit that has an image_url but no local file
//      yet (Wikimedia Commons, 1000 px wide), together with author and licence;
//   2. writes src/data/generated/image-status.json from the local files, with their
//      pixel size (against layout shift) and the credits from scripts/image-credits.json.
//
// To replace a photo: change image_url in ../data/inventions.json, delete
// public/exhibits/<id>.jpg and public/exhibits/thumb/<id>.jpg, run `npm run data`.
// A newly fetched photo is also copied as its own thumbnail (1000 px); shrink the
// copy in thumb/ to 400 px wide with any image editor if page weight matters.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sizeOf from 'image-size';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../src/data/generated');
const PUBLIC = resolve(HERE, '../public/exhibits');
const CREDITS = resolve(HERE, 'image-credits.json');
const items = JSON.parse(readFileSync(resolve(OUT, 'inventions.json'), 'utf8'));
const credits = existsSync(CREDITS) ? JSON.parse(readFileSync(CREDITS, 'utf8')) : {};
const HEADERS = { 'User-Agent': 'WorldOfInventionsSite/1.0 (educational museum project; image fetch)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => String(html ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

async function fetchRetry(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(60000) }).catch(() => null);
    if (r && r.ok) return r;
    if (r && r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status}`);
    await sleep(10000 * (attempt + 1));
  }
  throw new Error('rate limited');
}

async function download(item) {
  const file = decodeURIComponent(new URL(item.image_url).pathname.split('/Special:FilePath/')[1] ?? '').replace(/_/g, ' ');
  if (!file) throw new Error('image_url is not a Wikimedia Commons Special:FilePath link');
  const api = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1000', format: 'json', redirects: '1',
  });
  const page = Object.values((await (await fetchRetry(api)).json()).query.pages)[0];
  const info = page?.imageinfo?.[0];
  if (!info) throw new Error(`File:${file} does not exist on Commons`);
  const data = Buffer.from(await (await fetchRetry(info.thumburl)).arrayBuffer());
  mkdirSync(resolve(PUBLIC, 'thumb'), { recursive: true });
  writeFileSync(resolve(PUBLIC, `${item.id}.jpg`), data);
  copyFileSync(resolve(PUBLIC, `${item.id}.jpg`), resolve(PUBLIC, 'thumb', `${item.id}.jpg`));
  const m = info.extmetadata ?? {};
  credits[item.id] = {
    file: page.title.slice(5),
    page: info.descriptionurl,
    artist: strip(m.Artist?.value).slice(0, 120) || null,
    license: strip(m.LicenseShortName?.value) || null,
    licenseUrl: m.LicenseUrl?.value ?? null,
  };
}

let fetched = 0;
for (const item of items) {
  if (!item.image_url || existsSync(resolve(PUBLIC, `${item.id}.jpg`))) continue;
  try {
    await download(item);
    fetched++;
    console.log(`fetched ${item.id}`);
    await sleep(1500);
  } catch (e) {
    console.log(`MISSING ${item.id} (${e.message})`);
  }
}
if (fetched) writeFileSync(CREDITS, JSON.stringify(credits, null, 2) + '\n');

const status = {};
let ok = 0;
for (const item of items) {
  const full = resolve(PUBLIC, `${item.id}.jpg`);
  if (!existsSync(full)) { status[item.id] = { ok: false, reason: 'no photo in public/exhibits' }; continue; }
  const { width, height } = sizeOf(readFileSync(full));
  const c = credits[item.id] ?? {};
  status[item.id] = {
    ok: true, width, height,
    src: `exhibits/${item.id}.jpg`,
    thumb: `exhibits/thumb/${item.id}.jpg`,
    file: c.file ?? `${item.id}.jpg`,
    page: c.page ?? null, artist: c.artist ?? null, license: c.license ?? null, licenseUrl: c.licenseUrl ?? null,
  };
  ok++;
}
writeFileSync(resolve(OUT, 'image-status.json'), JSON.stringify(status, null, 2) + '\n');
console.log(`[check-images] ${ok} of ${items.length} exhibits have a photo.`);
