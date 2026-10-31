// Read only: searches Wikimedia Commons for openly licensed photos to use as
// explanation images (data/explain-images/search.json), skips non-commercial
// and no-derivatives licences, and saves small previews plus a list with
// licence and author into .tmp/candidates/ for review.
import fs from 'node:fs';
import path from 'node:path';

const queries = JSON.parse(fs.readFileSync('data/explain-images/search.json', 'utf8'));
const only = process.argv[2] ? process.argv[2].split(',') : null;
const out = '.tmp/candidates';
fs.mkdirSync(out, { recursive: true });
const UA = { 'User-Agent': 'EasyPedia explanation images (easy-pedia.web.app; gussaay@gmail.com)' };
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  for (let i = 1; i <= 3; i += 1) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) { if (i === 3) throw e; await sleep(2000 * i); }
  }
}

for (const [key, list] of Object.entries(queries)) {
  if (only && !only.includes(key)) continue;
  const seen = new Map();
  for (const q of list) {
    const u = new URL('https://commons.wikimedia.org/w/api.php');
    Object.entries({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${q}`, gsrnamespace: '6', gsrlimit: '10',
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '960' }).forEach(([k, v]) => u.searchParams.set(k, v));
    const data = await (await get(u)).json();
    const pages = Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index);
    for (const p of pages) {
      const ii = p.imageinfo?.[0]; if (!ii || seen.has(p.title)) continue;
      const m = ii.extmetadata || {};
      const lic = strip(m.LicenseShortName?.value);
      if (!/^image\/(jpeg|png)$/.test(ii.mime)) continue;
      if (/NC|ND|fair use|copyright/i.test(lic) || !lic) continue;
      seen.set(p.title, { title: p.title, licence: lic, artist: strip(m.Artist?.value).slice(0, 120), credit: strip(m.Credit?.value).slice(0, 120),
        desc: strip(m.ImageDescription?.value).slice(0, 200), w: ii.width, h: ii.height, thumb: ii.thumburl, page: ii.descriptionurl, query: q });
    }
    await sleep(500);
  }
  const items = [...seen.values()].slice(0, 12);
  fs.mkdirSync(path.join(out, key), { recursive: true });
  for (const [i, it] of items.entries()) {
    try {
      const small = it.thumb.replace(/\/\d+px-/, '/330px-');
      const buf = Buffer.from(await (await get(small)).arrayBuffer());
      fs.writeFileSync(path.join(out, key, `${i + 1}.jpg`), buf);
    } catch (e) {
      try { const buf = Buffer.from(await (await get(it.thumb)).arrayBuffer()); fs.writeFileSync(path.join(out, key, `${i + 1}.jpg`), buf); } catch (e2) { it.error = e2.message; }
    }
    await sleep(300);
  }
  fs.writeFileSync(path.join(out, `${key}.json`), JSON.stringify(items, null, 1));
  console.log(`${key}: ${items.length} candidates`);
}
