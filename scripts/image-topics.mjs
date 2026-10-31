// Read only. Which topics have the most questions, so explanation images can
// be made where one picture serves the most questions (all banks).
// Prints one line per main topic: "count|slug|label|withImage|cards|banks".
//   node scripts/image-topics.mjs [--min 3]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const min = Number(args[args.indexOf('--min') + 1]) || 3;
fs.mkdirSync('.tmp', { recursive: true });
const read = (node) => {
  const out = path.join('.tmp', `get-${node}.json`);
  execFileSync('firebase', ['database:get', `/${node}`, '--project', 'easy-pedia', '--output', out], {
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
    maxBuffer: 1024 * 1024 * 1024,
  });
  return JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {};
};
const books = read('mcqs');
const bankOf = (source) => books[source]?.main_category || '?';
const all = read('quizqq');
const t = {};
let total = 0;
let noTopic = 0;
let withImg = 0;
for (const q of Object.values(all)) {
  if (!q || !q.question) continue;
  total += 1;
  if (q.exp_img) withImg += 1;
  const slug = q.topic;
  if (!slug) {
    noTopic += 1;
    continue;
  }
  const r = (t[slug] ||= { n: 0, img: 0, cards: 0, label: q.tags?.[slug] || slug, banks: {} });
  r.n += 1;
  if (q.exp_img) r.img += 1;
  r.cards += Object.keys(q.card_links || {}).length + Object.keys(q.mnem_links || {}).length;
  const b = bankOf(q.source);
  r.banks[b] = (r.banks[b] || 0) + 1;
}
const rows = Object.entries(t).sort((a, b) => b[1].n - a[1].n);
console.log(`questions ${total}, without a main topic ${noTopic}, with an explanation image ${withImg}, topics ${rows.length}`);
const counts = [1, 2, 3, 5, 10, 20].map((k) => `${k}+: ${rows.filter(([, r]) => r.n >= k).length}`);
console.log(`topics by size ${counts.join(', ')}`);
console.log('=== TOPICS');
for (const [slug, r] of rows) {
  if (r.n < min) break;
  const banks = Object.entries(r.banks).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b}:${n}`).join(' ');
  console.log(`${r.n}|${slug}|${String(r.label).replace(/\|/g, '/')}|${r.img}|${r.cards}|${banks}`);
}
console.log('=== END');
const cardsTotal = Object.values(read('flashcard_items')).reduce((s, d) => s + Object.keys(d || {}).length, 0);
console.log(`flashcard and mnemonic cards: ${cardsTotal}`);
