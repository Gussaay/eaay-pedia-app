import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterSet,
  flattenProgress,
  isMnemonicCategory,
  isPictureBack,
  mnemonicBookSources,
  sectionOf,
  setKey,
  setQuery,
  setTitle,
  tallyBy,
} from './mnemonics.js';

test('a category is a mnemonic category only when kind says so', () => {
  assert.equal(isMnemonicCategory({ kind: 'mnemonic' }), true);
  assert.equal(isMnemonicCategory({ kind: '' }), false);
  assert.equal(isMnemonicCategory({}), false);
  assert.equal(isMnemonicCategory(null), false);
});

test('mnemonic book sources follow the category link', () => {
  const categories = [
    { source: 'mnem', kind: 'mnemonic' },
    { source: 'cards' },
  ];
  const books = [
    { source: 'b1', main_category: 'mnem' },
    { source: 'b2', main_category: 'cards' },
    { source: 'b3', main_category: 'mnem' },
  ];
  assert.deepEqual([...mnemonicBookSources(categories, books)].sort(), ['b1', 'b3']);
  assert.equal(mnemonicBookSources([], books).size, 0);
});

test('a picture back needs an image and no answer text', () => {
  assert.equal(isPictureBack({ back: '', back_img: 'x.png' }), true);
  assert.equal(isPictureBack({ back: '  ', back_img: 'x.png' }), true);
  assert.equal(isPictureBack({ back: 'Answer', back_img: 'x.png' }), false);
  assert.equal(isPictureBack({ back: '', back_img: '' }), false);
  assert.equal(isPictureBack(null), false);
});

const CARDS = [
  { _key: 'a', deck: 'cardio', chapter: 'Pharmacology', source: 'TAS 2025 paper' },
  { _key: 'b', deck: 'cardio', chapter: '', source: 'Survival guide book' },
  { _key: 'c', deck: 'neuro', chapter: 'Pharmacology', source: 'PasTest TAS question bank' },
  { _key: 'd', deck: 'neuro', chapter: 'Anatomy', source: 'TAS 2025 paper' },
];

test('a card with no section counts as Clinical', () => {
  assert.equal(sectionOf({ chapter: '' }), 'Clinical');
  assert.equal(sectionOf({ chapter: ' Physiology ' }), 'Physiology');
});

test('a set narrows by chapter, section and source together', () => {
  assert.deepEqual(filterSet(CARDS, { deck: 'cardio' }).map((c) => c._key), ['a', 'b']);
  assert.deepEqual(filterSet(CARDS, { section: 'Pharmacology' }).map((c) => c._key), ['a', 'c']);
  assert.deepEqual(filterSet(CARDS, { source: 'TAS 2025 paper' }).map((c) => c._key), ['a', 'd']);
  assert.deepEqual(filterSet(CARDS, { deck: 'neuro', section: 'Pharmacology' }).map((c) => c._key), ['c']);
  assert.equal(filterSet(CARDS, {}).length, 4);
  assert.deepEqual(filterSet(CARDS, { section: 'Clinical' }).map((c) => c._key), ['b']);
});

test('tallies follow the given order, then size', () => {
  const t = tallyBy(CARDS, sectionOf, ['Clinical', 'Anatomy', 'Pharmacology']);
  assert.deepEqual(t.map((x) => x.name), ['Clinical', 'Anatomy', 'Pharmacology']);
  assert.equal(t.find((x) => x.name === 'Pharmacology').total, 2);
});

test('set titles read naturally', () => {
  assert.equal(setTitle({ deckTitle: 'Cardiology' }), 'Cardiology');
  assert.equal(setTitle({ deckTitle: 'Cardiology', section: 'Pharmacology' }), 'Cardiology · Pharmacology');
  assert.equal(setTitle({ section: 'Pharmacology' }), 'Pharmacology — all chapters');
  assert.equal(setTitle({ source: 'TAS 2025 paper' }), 'TAS 2025 paper');
});

test('set queries leave out empty filters and keys stay stable', () => {
  assert.equal(setQuery({ book: 'tas', deck: '', section: 'Anatomy' }), 'book=tas&section=Anatomy');
  assert.equal(setKey({ book: 'tas', section: 'Anatomy' }), 'tas||Anatomy|');
  assert.notEqual(setKey({ book: 'tas', deck: 'x' }), setKey({ book: 'tas', source: 'x' }));
});

test('progress from several decks merges by card', () => {
  const merged = flattenProgress({ cardio: { a: { box: 1 } }, neuro: { c: { box: 2 } }, other: { z: {} } }, ['cardio', 'neuro']);
  assert.deepEqual(Object.keys(merged).sort(), ['a', 'c']);
});

test('look-alikes need real shared topic words', async () => {
  const { findSimilar, overlap, topicWords } = await import('./mnemonics.js');
  assert.deepEqual([...topicWords('The causes of [N]eonatal hypoglycaemia')].sort(), ['causes', 'hypoglycaemia', 'neonatal']);
  assert.equal(overlap('neonatal hypoglycaemia causes', 'causes of hypoglycaemia in neonates'), 2 / 3);
  const items = ['Causes of neonatal hypoglycaemia', 'Causes of stridor', 'Features of Kawasaki disease'];
  const hits = findSimilar('What are the causes of hypoglycaemia in a neonatal baby?', items);
  assert.equal(hits[0].item, 'Causes of neonatal hypoglycaemia');
  assert.equal(hits.length, 1);
  assert.deepEqual(findSimilar('stridor', items), []);
});

test('cards group into runs by heading, keeping their index', async () => {
  const { groupByHeading } = await import('./mnemonics.js');
  const g = groupByHeading([{ t: 'A' }, { t: 'A' }, { t: 'B' }, { t: 'A' }], (x) => x.t);
  assert.deepEqual(g.map((x) => [x.heading, x.start, x.cards.length]), [['A', 0, 2], ['B', 2, 1], ['A', 3, 1]]);
});
