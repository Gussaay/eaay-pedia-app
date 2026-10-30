// Builds every logo/icon/splash PNG from the vector sources in assets/brand/.
// Run: node scripts/make-icons.mjs
//   logo-icon.svg       rounded app icon (in-app logo, small sizes, legacy launcher)
//   logo-full.svg       icon + "Easy Pedia MCQs" wordmark (splash screens)
//   icon-square.svg     full-bleed square (PWA maskable icon, round launcher)
//   icon-foreground.svg / icon-background.svg   Android adaptive icon layers
import sharp from 'sharp';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';

const BRAND = 'assets/brand';
const RES = 'android/app/src/main/res';
const BLUE = { r: 25, g: 118, b: 210, alpha: 1 }; // splash background, matches capacitor.config

const svg = (name, size) => sharp(`${BRAND}/${name}.svg`, { density: 72 * (size / 1024) * 2 })
  .resize(size, size)
  .png();

const circle = (size) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
);

const write = async (name, size, out) => {
  await svg(name, size).toFile(out);
};

const round = async (name, size, out) => {
  const img = await svg(name, size).toBuffer();
  await sharp(img).composite([{ input: circle(size), blend: 'dest-in' }]).png().toFile(out);
};

const splash = async (w, h, out) => {
  const logo = await svg('logo-full', Math.round(Math.min(w, h) * 0.55)).toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: BLUE } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(out);
};

// Web / PWA
mkdirSync('public/img', { recursive: true });
await write('logo-icon', 512, 'public/img/logo.png');
await write('logo-icon', 128, 'public/img/app_icon.png');
await write('logo-icon', 640, 'public/img/icon.png');
await write('logo-icon', 640, 'public/icon.png');
await write('icon-square', 192, 'public/icon-192.png');
await write('icon-square', 512, 'public/icon-512.png');

// Sources for `npx @capacitor/assets generate --android`
mkdirSync('assets', { recursive: true });
await write('icon-square', 1024, 'assets/icon-only.png');
await write('icon-foreground', 1024, 'assets/icon-foreground.png');
await write('icon-background', 1024, 'assets/icon-background.png');
await splash(2732, 2732, 'assets/splash.png');
await splash(2732, 2732, 'assets/splash-dark.png');

// Android launcher icons and splash drawables (same sizes as the files already there)
if (existsSync(RES)) {
  const densities = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, size] of Object.entries(densities)) {
    const dir = `${RES}/mipmap-${d}`;
    if (!existsSync(dir)) continue;
    await write('logo-icon', size, `${dir}/ic_launcher.png`);
    await round('icon-square', size, `${dir}/ic_launcher_round.png`);
    await write('icon-foreground', size, `${dir}/ic_launcher_foreground.png`);
    await write('icon-background', size, `${dir}/ic_launcher_background.png`);
  }
  for (const dir of readdirSync(RES).filter((n) => n.startsWith('drawable'))) {
    const file = `${RES}/${dir}/splash.png`;
    if (!existsSync(file)) continue;
    const { width, height } = await sharp(file).metadata();
    await splash(width, height, file);
  }
}
console.log('icons written');
