import test from 'node:test';
import assert from 'node:assert/strict';
import { linkUpdates, linksMap, linksOf, mnemonicFor, parseRef, questionLinks, refOf } from './mnemonicLinks.js';

test('refs join and split a deck and a card id', () => {
  assert.equal(refOf('d1', 'c1'), 'd1~c1');
  assert.deepEqual(parseRef('d1~c1'), { deck: 'd1', card: 'c1' });
  assert.equal(parseRef('nonsense'), null);
  assert.equal(parseRef(''), null);
});

test('links read from a map or a list, without duplicates or junk', () => {
  assert.deepEqual(linksOf({ links: { 'a~1': true, 'b~2': true, 'c~3': false } }), ['a~1', 'b~2']);
  assert.deepEqual(linksOf({ links: ['a~1', 'a~1', 'bad'] }), ['a~1']);
  assert.deepEqual(linksOf({}), []);
  assert.equal(linksMap([]), null);
  assert.deepEqual(linksMap(['a~1']), { 'a~1': true });
});

test('changing links writes both the added and the removed reverse entries', () => {
  const u = linkUpdates('m~9', ['a~1', 'b~2'], ['b~2', 'c~3']);
  assert.deepEqual(u, {
    'mnemonic_links/a/1/m~9': null,
    'mnemonic_links/b/2/m~9': true,
    'mnemonic_links/c/3/m~9': true,
  });
  assert.deepEqual(linkUpdates('m~9', ['a~1'], []), { 'mnemonic_links/a/1/m~9': null });
  assert.deepEqual(linkUpdates('bad', ['a~1'], []), {});
});

test('a flashcard finds its mnemonic in the deck link map', () => {
  const deck = { c1: { 'm~1': true }, c2: { 'm~2': false } };
  assert.equal(mnemonicFor(deck, 'c1'), 'm~1');
  assert.equal(mnemonicFor(deck, 'c2'), null);
  assert.equal(mnemonicFor(deck, 'c3'), null);
  assert.equal(mnemonicFor(null, 'c1'), null);
});

test('questionLinks reads both link maps of a quiz question', () => {
  const q = { mnem_links: { 'm~1': true }, card_links: { 'f~1': true, 'f~2': true, bad: true } };
  assert.deepEqual(questionLinks(q), { mnemonics: ['m~1'], flashcards: ['f~1', 'f~2'] });
  assert.deepEqual(questionLinks({}), { mnemonics: [], flashcards: [] });
  assert.deepEqual(questionLinks(null), { mnemonics: [], flashcards: [] });
});
