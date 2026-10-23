import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTagLine, tagSlug, tagsOf } from './topicTags.js';

test('tag slugs are database-safe and stable', () => {
  assert.equal(tagSlug('Long QT syndrome'), 'long-qt-syndrome');
  assert.equal(tagSlug("Cow's milk protein allergy"), 'cows-milk-protein-allergy');
  assert.equal(tagSlug('IgA vasculitis (Henoch-Schönlein purpura)'), 'iga-vasculitis-henoch-schonlein-purpura');
});

test('a tag line keeps its order and drops repeats', () => {
  assert.deepEqual(
    parseTagLine('Kawasaki disease; Coronary artery aneurysm;  ; kawasaki disease').map((t) => t.slug),
    ['kawasaki-disease', 'coronary-artery-aneurysm'],
  );
});

test('tags are read from the stored map', () => {
  assert.deepEqual(tagsOf({ tags: { 'long-qt-syndrome': 'Long QT syndrome', 'bad/key': 'x' } }), [
    { slug: 'long-qt-syndrome', label: 'Long QT syndrome' },
  ]);
  assert.deepEqual(
    tagsOf({ tags: { a: 'A', b: 'B' }, topic: 'b' }).map((t) => t.slug),
    ['b', 'a'],
  );
  assert.deepEqual(tagsOf({}), []);
});
