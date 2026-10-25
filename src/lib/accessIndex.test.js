import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexEntries } from './accessIndex.js';
import { scopeKey } from './access.js';

test('a quiz, its book and its sets map to what the rules look up', () => {
  const out = indexEntries({ quizKey: '-Nq1', source: 'tas', bank: 'mrcpch', group: ' FOP ', bchap: 'mrcpch|Cardiology', bsci: 'mrcpch|' });
  assert.deepEqual(out, {
    'qkey/-Nq1': 'tas',
    'qbook/tas/bank': 'mrcpch',
    'qbook/tas/group': 'FOP',
    'qset/mrcpch|Cardiology': 'mrcpch',
  });
  // The rule builds the unlock key from the stored parts.
  assert.equal(`group~${out['qbook/tas/bank']}|${out['qbook/tas/group']}`, scopeKey('group', 'mrcpch|FOP'));
});

test('group names with characters keys cannot hold are encoded like unlock keys', () => {
  const out = indexEntries({ source: 'b1', bank: 'mrcpch', group: 'A/B' });
  assert.equal(`group~mrcpch|${out['qbook/b1/group']}`, scopeKey('group', 'mrcpch|A/B'));
});

test('a book in no group clears its group; bad keys are skipped', () => {
  assert.deepEqual(indexEntries({ source: 'b1', bank: 'mrcpch' }), { 'qbook/b1/bank': 'mrcpch', 'qbook/b1/group': null });
  assert.deepEqual(indexEntries({ quizKey: 'a.b', source: 's', bchap: 'mrcpch|Dr. X' }), {});
});
