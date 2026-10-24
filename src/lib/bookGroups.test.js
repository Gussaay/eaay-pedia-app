import test from 'node:test';
import assert from 'node:assert/strict';
import { groupBooks } from './bookGroups.js';

const books = [
  { source: 'pastests', group: 'TAS' },
  { source: 'fopsample', group: 'FOP' },
  { source: 'tasrecall', group: 'TAS' },
  { source: 'other' },
];
const bank = {
  groups: {
    TAS: { title: 'TAS', subtitle: 'Theory and Science', order: 1 },
    FOP: { title: 'FOP', subtitle: 'Foundation of Practice', order: 2 },
  },
};

test('books fall into their groups in the bank order, keeping book order', () => {
  const { groups, loose } = groupBooks(books, bank);
  assert.deepEqual(groups.map((g) => g.key), ['TAS', 'FOP']);
  assert.deepEqual(groups[0].books.map((b) => b.source), ['pastests', 'tasrecall']);
  assert.equal(groups[1].subtitle, 'Foundation of Practice');
  assert.deepEqual(loose.map((b) => b.source), ['other']);
});

test('a bank without groups lists its books unchanged', () => {
  const { groups, loose } = groupBooks([{ source: 'a' }, { source: 'b' }], {});
  assert.equal(groups.length, 0);
  assert.equal(loose.length, 2);
});

test('a group the bank does not name still shows, after the named ones', () => {
  const { groups } = groupBooks([{ source: 'x', group: 'Extra' }, ...books], bank);
  assert.deepEqual(groups.map((g) => g.key), ['TAS', 'FOP', 'Extra']);
});
