// Builds the transparent logo + PWA/Capacitor icons from the Android icon.png
// (which has an opaque black background). Run: node scripts/make-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'public/icon.png';
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;

// Flood-fill near-black pixels connected to the border -> transparent.
// Black outlines inside the letters/hand are not connected, so they stay.
const dark = (i) => data[i] + data[i + 1] + data[i + 2] < 90;
const seen = new Uint8Array(w * h);
const stack = [];
for (let x = 0; x < w; x += 1) stack.push(x, (h - 1) * w + x);
for (let y = 0; y < h; y += 1) stack.push(y * w, y * w + w - 1);
while (stack.length) {
  const p = stack.pop();
  if (seen[p]) continue;
  seen[p] = 1;
  if (!dark(p * 4)) continue;
  data[p * 4 + 3] = 0;
  const x = p % w;
  const y = (p / w) | 0;
  if (x > 0) stack.push(p - 1);
  if (x < w - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - w);
  if (y < h - 1) stack.push(p + w);
}

const transparent = sharp(data, { raw: { width: w, height: h, channels: 4 } });
const trimmed = await transparent.png().toBuffer().then((b) => sharp(b).trim().toBuffer());
const logo = async (size) =>
  sharp(trimmed).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

const onBackground = async (size, inner, bg, out) => {
  const l = await logo(inner);
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: l, gravity: 'center' }])
    .png()
    .toFile(out);
};

mkdirSync('assets', { recursive: true });
await sharp(await logo(512)).toFile('public/img/logo.png');
const white = { r: 255, g: 255, b: 255, alpha: 1 };
const blue = { r: 25, g: 118, b: 210, alpha: 1 };
await onBackground(512, 400, white, 'public/icon-512.png');
await onBackground(192, 150, white, 'public/icon-192.png');
// Sources for `npx @capacitor/assets generate --android`
await onBackground(1024, 800, white, 'assets/icon-only.png');
await onBackground(1024, 600, { r: 0, g: 0, b: 0, alpha: 0 }, 'assets/icon-foreground.png');
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: white } }).png().toFile('assets/icon-background.png');
await onBackground(2732, 700, blue, 'assets/splash.png');
await onBackground(2732, 700, blue, 'assets/splash-dark.png');
console.log('icons written');
