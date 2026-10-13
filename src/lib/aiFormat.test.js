import test from 'node:test';
import assert from 'node:assert/strict';
import { cardsToCsv, mcqsToCsv, normalizeCards, normalizeMcqs, parseReply, plainMath, questionFingerprint } from './aiFormat.js';

test('normalizeMcqs keeps playable questions and drops broken ones', () => {
  const out = normalizeMcqs([
    { question: 'Q1', a: 'A) one', b: 'two', c: 'three', d: 'four', answer: 'B', exp: 'because' },
    { question: 'no options', a: 'x', answer: 'a' },
    { question: 'key points at empty option', a: 'x', b: 'y', answer: 'e' },
    null,
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].a, 'one');
  assert.equal(out[0].answer, 'b');
  assert.equal(out[0].e, '');
});

test('normalizeMcqs handles non-arrays', () => {
  assert.deepEqual(normalizeMcqs({}), []);
  assert.deepEqual(normalizeCards('x'), []);
});

test('normalizeCards needs both sides', () => {
  const out = normalizeCards([{ front: 'f', back: 'b' }, { front: 'only' }]);
  assert.deepEqual(out, [{ front: 'f', back: 'b', hint: '' }]);
});

test('CSV export quotes commas, quotes and newlines', () => {
  const csv = mcqsToCsv([{ question: 'a, "b"', a: '1', b: '2', c: '', d: '', e: '', answer: 'a', exp: 'x\ny' }]);
  assert.equal(csv.split('\n')[0], 'question,a,b,c,d,e,answer,exp');
  assert.ok(csv.includes('"a, ""b"""'));
  assert.ok(csv.includes('"x\ny"'));
  assert.equal(cardsToCsv([{ front: 'f', back: 'b', hint: '' }]), 'front,back,hint\nf,b,');
});

test('parseReply splits bullets, headings and bold', () => {
  const blocks = parseReply('## Title\nSome **bold** text\n- item one\n2. item two\n\n');
  assert.deepEqual(blocks.map((b) => b.type), ['h', 'p', 'li', 'li']);
  assert.deepEqual(blocks[1].parts, [
    { text: 'Some ', bold: false },
    { text: 'bold', bold: true },
    { text: ' text', bold: false },
  ]);
});

test('parseReply turns --- into a divider and LaTeX chemistry into text', () => {
  const blocks = parseReply('**Sodium Bicarbonate ($NaHCO_3$):**\n---\nGive $Ca^{2+}$');
  assert.deepEqual(blocks.map((b) => b.type), ['p', 'hr', 'p']);
  assert.equal(blocks[0].parts[0].text, 'Sodium Bicarbonate (NaHCO₃):');
  assert.equal(blocks[2].parts[0].text, 'Give Ca²⁺');
  assert.equal(plainMath('costs $5 and $10'), 'costs $5 and $10');
});

test('questionFingerprint changes when the question is edited', () => {
  const q = { question: 'Q', a: 'x', b: 'y', answer: 'a' };
  assert.equal(questionFingerprint(q), questionFingerprint({ ...q, exp: 'new explanation' }));
  assert.notEqual(questionFingerprint(q), questionFingerprint({ ...q, answer: 'b' }));
});
