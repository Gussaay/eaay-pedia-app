// Read only. Counts which app version people use (quizusers/<uid>/ver, written
// on every launch: "5" or missing = the old Sketchware app, "6" = the new app)
// and how recently each group was active, and lists the database's top-level
// nodes (needed before tightening database.rules.json). Prints counts and
// names only, never anyone's details: the workflow log is public.
//   node scripts/app-versions.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const project = 'easy-pedia';
fs.mkdirSync('.tmp', { recursive: true });
const get = (node, extra = []) => {
  const out = path.join('.tmp', `get-${node.replace(/\W/g, '_') || 'root'}.json`);
  execFileSync('firebase', ['database:get', `/${node}`, '--project', project, '--output', out, ...extra], {
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });
  return JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {};
};

const top = get('', ['--shallow']);
console.log('== top-level nodes:', Object.keys(top).sort().join(', '));

const users = get('quizusers');
const now = Date.now();
const age = (d) => {
  const t = Date.parse(d || '');
  if (Number.isNaN(t)) return 'never';
  const days = (now - t) / 86_400_000;
  return days <= 7 ? '7d' : days <= 30 ? '30d' : days <= 90 ? '90d' : days <= 365 ? '1y' : 'older';
};
const table = {};
const fields = {};
for (const u of Object.values(users)) {
  const ver = u && u.ver !== undefined ? String(u.ver) : '(none)';
  table[ver] ||= { total: 0, '7d': 0, '30d': 0, '90d': 0, '1y': 0, older: 0, never: 0 };
  table[ver].total += 1;
  table[ver][age(u?.date)] += 1;
  for (const k of Object.keys(u || {})) if (!/^-|^[A-Za-z0-9]{20,}$/.test(k)) fields[k] = (fields[k] || 0) + 1;
}
console.log(`\n== quizusers: ${Object.keys(users).length} accounts, by "ver" and last active (date field)`);
console.table(table);
console.log('\n== quizusers field names (accounts having each):');
console.log(Object.entries(fields).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k, n]) => `${k}:${n}`).join('  '));
