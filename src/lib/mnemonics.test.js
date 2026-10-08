import test from 'node:test';
import assert from 'node:assert/strict';
import { isMnemonicCategory, isPictureBack, mnemonicBookSources } from './mnemonics.js';

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
