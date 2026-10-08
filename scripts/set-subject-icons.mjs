// Gives every deck and quiz its own subject icon.
//
// The bulk uploads left all 28 quizzes sharing one cover photo and the decks
// with no picture at all. This matches each one to a drawn icon by title (see
// scripts/subject-icons.mjs) and writes it to the `img` field.
//
//   node scripts/set-subject-icons.mjs --deck-source pastets --quiz-source pastests
//   … --commit         to write
//   … --force          replace an image that is already set
//
// Only `img` is touched; nothing else about a deck or quiz is rewritten.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { subjectIcon, SUBJECT_NAMES } from './subject-icons.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const value = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? null : args[i + 1];
};

const project = value('project') || 'easy-pedia';
const deckSource = value('deck-source');
const quizSource = value('quiz-source');
const force = flag('force');

const fb = (a) =>
  execFileSync('firebase', a, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });

const outDir = path.join(process.cwd(), '.tmp');
fs.mkdirSync(outDir, { recursive: true });

const updates = {};
const report = [];

/** An icon matched on title, ignoring case and spacing. */
const iconFor = (title) => {
  const want = String(title || '').trim().toLowerCase();
  const hit = SUBJECT_NAMES.find((n) => n.toLowerCase() === want);
  return hit ? subjectIcon(hit) : null;
};

if (deckSource) {
  const decks = JSON.parse(fb(['database:get', '/flashdecks', '--project', project]) || 'null') || {};
  Object.entries(decks)
    .filter(([, d]) => d.source === deckSource)
    .forEach(([key, d]) => {
      const icon = iconFor(d.title);
      const already = d.img && !String(d.img).startsWith('data:image/svg');
      if (!icon) report.push(['deck', d.title, 'no icon for this title']);
      else if (already && !force) report.push(['deck', d.title, 'has its own picture — left alone']);
      else {
        updates[`flashdecks/${key}/img`] = icon;
        report.push(['deck', d.title, 'icon set']);
      }
    });
}

if (quizSource) {
  const quizzes = JSON.parse(fb(['database:get', '/allquiz', '--project', project]) || 'null') || {};
  Object.entries(quizzes)
    .filter(([, q]) => q.source === quizSource)
    .forEach(([key, q]) => {
      const icon = iconFor(q.title);
      // Every quiz here shares one uploaded photo, so "has its own picture" is
      // not a reason to skip unless it was deliberately set per subject.
      if (!icon) report.push(['quiz', q.title, 'no icon for this title']);
      else {
        updates[`allquiz/${key}/img`] = icon;
        report.push(['quiz', q.title, 'icon set']);
      }
    });
}

report.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
report.forEach(([kind, title, what]) => console.log(`  ${kind.padEnd(5)} ${String(title).padEnd(20)} ${what}`));
console.log(`\n${Object.keys(updates).length} image(s) to set.`);
if (!Object.keys(updates).length) process.exit(0);

const payload = path.join(outDir, 'icons.json');
fs.writeFileSync(payload, JSON.stringify(updates));
console.log(`Payload: ${(fs.statSync(payload).size / 1024).toFixed(0)} KB`);

if (!flag('commit')) {
  console.log('\nDRY RUN — nothing written. Add --commit to write it.');
  process.exit(0);
}

console.log('\nWriting…');
fb(['database:update', '/', JSON.stringify(payload), '--project', project, '--force']);
console.log('Done.');
