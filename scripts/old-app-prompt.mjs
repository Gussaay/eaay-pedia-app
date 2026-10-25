// The old Android (Sketchware) app compares update/app/ver with its own
// version ("5") and asks its users to update when it is higher. The new app
// never reads this node. Prints the node's field names and ver only.
//   node scripts/old-app-prompt.mjs [--commit]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const commit = process.argv.includes('--commit');
const fb = (args) =>
  execFileSync('firebase', [...args, '--project', 'easy-pedia'], {
    encoding: 'utf8',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    shell: true,
  });
fs.mkdirSync('.tmp', { recursive: true });
const out = path.join('.tmp', 'update-app.json');
fb(['database:get', '/update/app', '--output', out]);
const app = JSON.parse(fs.readFileSync(out, 'utf8') || 'null') || {};
console.log('update/app fields:', Object.keys(app).join(', ') || '(none)');
console.log('update/app/ver now:', JSON.stringify(app.ver));
if (!commit) process.exit(0);
const file = path.join('.tmp', 'ver.json');
// Android stored every value as a string.
fs.writeFileSync(file, JSON.stringify('6'));
fb(['database:set', '/update/app/ver', file, '--force']);
console.log('update/app/ver set to "6"');
