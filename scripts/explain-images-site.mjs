// Puts the explanation images (data/explain-images/images.json) into the built
// site, under dist/explain/, so questions can point at
// https://easy-pedia.web.app/explain/<file>.
//
//   node scripts/explain-images-site.mjs [dist]
//
// Drawings are our own PNGs in data/explain-images/out/. Open-licence photos
// (CDC PHIL) are downloaded at deploy time from their source, because the
// cloud workspace that prepares them cannot reach those sites. Runs after the
// over-the-air zip is made, so the images never bloat the app bundle.
// A photo that cannot be downloaded is reported but does not fail the deploy.
import fs from 'node:fs';
import path from 'node:path';

const dist = process.argv[2] || 'dist';
const { images } = JSON.parse(fs.readFileSync('data/explain-images/images.json', 'utf8'));
const outDir = path.join(dist, 'explain');
fs.mkdirSync(outDir, { recursive: true });
const cacheDir = process.env.EXPLAIN_PHOTO_CACHE || '';
if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });

let failed = 0;
for (const im of images) {
  const target = path.join(outDir, im.file);
  if (!im.photo) {
    fs.copyFileSync(path.join('data/explain-images/out', im.file), target);
    console.log(`drawing  ${im.file}`);
    continue;
  }
  // A photo downloaded by an earlier release is reused, not fetched again.
  const saved = cacheDir && path.join(cacheDir, `${im.key}-${path.basename(new URL(im.photo).pathname)}`);
  if (saved && fs.existsSync(saved) && fs.statSync(saved).size > 2000) {
    fs.copyFileSync(saved, target);
    console.log(`saved    ${im.file}`);
    continue;
  }
  let ok = false;
  // Wikimedia answers 429 (too many requests) when files are fetched quickly,
  // so space the downloads out and back off longer on each retry.
  await new Promise((r) => setTimeout(r, 1500));
  for (let attempt = 1; attempt <= 5 && !ok; attempt += 1) {
    try {
      const res = await fetch(im.photo, { headers: { 'User-Agent': 'EasyPediaExplanationImages/1.0 (https://easy-pedia.web.app; gussaay@gmail.com) node-fetch' } });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) throw new Error(`HTTP ${res.status} ${type}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) throw new Error(`only ${buf.length} bytes`);
      fs.writeFileSync(target, buf);
      if (saved) fs.writeFileSync(saved, buf);
      console.log(`photo    ${im.file} (${Math.round(buf.length / 1024)} KB)`);
      ok = true;
    } catch (e) {
      console.log(`  try ${attempt} for ${im.file}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 5000 * 2 ** (attempt - 1)));
    }
  }
  if (!ok) failed += 1;
}
if (failed) console.log(`::warning::${failed} explanation photo(s) could not be downloaded; they show as "Image unavailable" until the next deploy.`);
