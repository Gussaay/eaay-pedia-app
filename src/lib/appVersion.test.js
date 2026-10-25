import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appOf } from './appVersion.js';

test('appOf tells the old app from the new one', () => {
  assert.equal(appOf({}).kind, 'old');
  assert.equal(appOf({ ver: '5' }).label, 'Old app (v5)');
  assert.equal(appOf({ ver: '6' }).kind, 'new');
  assert.deepEqual(appOf({ ver: '6', app: '6.0.51', platform: 'android' }), { kind: 'android', label: 'Android 6.0.51', short: 'v6.0.51' });
  assert.equal(appOf({ ver: '6', app: '6.0.51', platform: 'web' }).kind, 'web');
});
