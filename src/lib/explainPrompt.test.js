import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainInstructions, explainPrompt, LINK_BUDGET, linkedBlock, MAX_LINKS, pickLinks } from '../../functions/explainPrompt.js';

const q = (n, extra = {}) => ({ question: `Stem ${n}`, a: 'Alpha', b: 'Beta', c: 'Gamma', d: 'Delta', answer: 'b', exp: `Because ${n}`, ...extra });

test('pickLinks: similar first, then linked; same copies and itself left out', () => {
  const me = { same: { s1: 1 }, similar: { x1: 1, s1: 1, me: 1, off: 0 }, related: { r1: 1, x1: 1, r2: 1 } };
  const { pick, total } = pickLinks(me, 'me');
  assert.deepEqual(pick, [{ kind: 'similar', id: 'x1' }, { kind: 'linked', id: 'r1' }, { kind: 'linked', id: 'r2' }]);
  assert.equal(total, 3);
  assert.deepEqual(pickLinks(null, 'me'), { pick: [], total: 0 });
});

test('pickLinks caps at MAX_LINKS but reports the total', () => {
  const related = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`r${i}`, 1]));
  const { pick, total } = pickLinks({ related }, 'me');
  assert.equal(pick.length, MAX_LINKS);
  assert.equal(total, 25);
});

test('linkedBlock carries stem, options, key with its text and the explanation', () => {
  const { text, shown } = linkedBlock([{ kind: 'similar', q: q(1) }, { kind: 'linked', q: q(2, { exp: '' }) }]);
  assert.equal(shown, 2);
  assert.match(text, /Q1 \(similar: same fact\): Stem 1/);
  assert.match(text, /A\. Alpha \/ B\. Beta/);
  assert.match(text, /Key: B \(Beta\)/);
  assert.match(text, /Bank explanation: Because 1/);
  assert.match(text, /Q2 \(linked: same condition/);
  assert.match(text, /Bank explanation: none/);
});

test('linkedBlock stays within the budget and says how many were left out', () => {
  const long = 'x'.repeat(5000);
  const rows = Array.from({ length: 10 }, (_, i) => ({ kind: 'linked', q: q(i, { question: long, exp: long }) }));
  const { text, shown } = linkedBlock(rows, 30);
  assert.ok(text.length < LINK_BUDGET + 400, `too long: ${text.length}`);
  assert.ok(shown >= 5 && shown <= 10);
  assert.match(text, new RegExp(`\\(${shown} of 30; the other ${30 - shown} were left out`));
});

test('linkedBlock skips rows without a stem', () => {
  assert.deepEqual(linkedBlock([{ kind: 'linked', q: null }, { kind: 'linked', q: { question: '' } }]), { text: '', shown: 0 });
});

test('the prompt asks for a linked summary and main point only when links are sent', () => {
  assert.doesNotMatch(explainInstructions(0), /linked questions say/);
  assert.match(explainInstructions(0), /Main point/);
  const linked = linkedBlock([{ kind: 'similar', q: q(1) }]);
  const p = explainPrompt('Question: Main stem\nAnswer key: A', linked);
  assert.ok(p.indexOf('Main stem') < p.indexOf('Stem 1'));
  assert.match(p, /What the linked questions say/);
  assert.match(p, /Main point/);
});
