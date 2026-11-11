import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  OSPE_KINDS,
  captionPrompt,
  groupByScience,
  groupBySource,
  groupBySystem,
  mergeSource,
  ospeScience,
  sourceName,
  sourcePath,
  sourcePaths,
  normalizeImgUrl,
  parseCaptionReply,
  questionSourceLabel,
  removeSource,
  srcKey,
  visibleCards,
} from '../../functions/ospeCore.js';
import { ospeId } from '../../functions/ospeId.js';

const NOW = 1_700_000_000_000;
const Q = { type: 'q', qid: 'abc', quiz: 'z1', n: 3, label: 'DOH › Jan · Q3' };
const C = { type: 'card', deck: 'd1', card: 'k2', label: 'Flashcards › Book › Deck' };

test('kinds come in the agreed order', () => {
  assert.deepEqual(
    OSPE_KINDS.map((k) => k.key),
    ['skin', 'syndrome', 'xray', 'ecg', 'micro', 'sign', 'drawing', 'other'],
  );
  assert.equal(OSPE_KINDS[2].label, 'X-ray');
  assert.equal(OSPE_KINDS[5].label, 'Clinical sign');
});

test('normalizeImgUrl trims and lowercases scheme and host only', () => {
  assert.equal(normalizeImgUrl('  HTTPS://Example.COM/Path/Img.PNG?Token=AbC  '), 'https://example.com/Path/Img.PNG?Token=AbC');
  const fb = 'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media&token=T0k';
  assert.equal(normalizeImgUrl(fb), fb);
  assert.equal(normalizeImgUrl('HTTP://A.com'), 'http://a.com');
  assert.equal(normalizeImgUrl('HTTP://A.COM?Q=1'), 'http://a.com?Q=1');
  assert.equal(normalizeImgUrl(''), '');
  assert.equal(normalizeImgUrl(null), '');
  assert.equal(normalizeImgUrl(undefined), '');
  assert.equal(normalizeImgUrl('  relative/Path.png '), 'relative/Path.png');
});

test('ospeId is 16 hex, stable, and equal for urls that normalise alike', () => {
  const id = ospeId('https://Example.com/a.png');
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(id, ospeId('  https://example.COM/a.png '));
  assert.equal(id, createHash('sha1').update('https://example.com/a.png').digest('hex').slice(0, 16));
  assert.notEqual(id, ospeId('https://example.com/b.png'));
  assert.notEqual(id, ospeId('https://example.com/a.png?x=1'));
  assert.equal(ospeId(''), '');
  assert.equal(ospeId('   '), '');
  assert.equal(ospeId(undefined), '');
});

test('srcKey names a question or a flashcard', () => {
  assert.equal(srcKey(Q), 'q~abc');
  assert.equal(srcKey(C), 'c~d1~k2');
});

test('visibleCards keeps checked and auto cards with a picture, sorted by title', () => {
  const out = visibleCards({
    k1: { status: 'checked', img: 'u1', title: 'banana' },
    k2: { status: 'auto', img: 'u2', title: 'Apple' },
    k3: { status: 'waiting', img: 'u3', title: 'a' },
    k4: { status: 'hidden', img: 'u4', title: 'b' },
    k5: { status: 'checked', img: '', title: 'c' },
    k6: null,
    k7: { status: 'auto', img: 'u7' },
  });
  assert.deepEqual(out.map((c) => c._key), ['k7', 'k2', 'k1']);
  assert.equal(out[1].title, 'Apple');
  assert.deepEqual(visibleCards(null), []);
  assert.deepEqual(visibleCards({}), []);
});

test('groupBySystem follows the chapter order, drops empty ones and files the rest under Other', () => {
  const chapters = ['Cardiology', 'Respiratory', 'Neurology'];
  const cards = [
    { _key: 'a', title: 'Cyanosis', chapter: 'Respiratory', topic: 'cyanosis', topic_label: 'Cyanosis' },
    { _key: 'b', title: 'VSD', chapter: 'Cardiology', topic: 'chd', topic_label: 'Congenital heart disease' },
    { _key: 'c', title: 'ASD', chapter: 'Cardiology', topic: 'chd', topic_label: 'Congenital heart disease' },
    { _key: 'd', title: 'Mystery', chapter: '', topic: '', topic_label: '' },
    { _key: 'e', title: 'Odd', chapter: 'Not a chapter', topic: 'odd', topic_label: 'Odd things' },
    { _key: 'f', title: 'Arrhythmia', chapter: 'Cardiology', topic: 'ecg', topic_label: 'ECG' },
  ];
  const out = groupBySystem(cards, chapters);
  assert.deepEqual(out.map((g) => g.chapter), ['Cardiology', 'Respiratory', 'Other']);
  assert.deepEqual(out.map((g) => g.n), [3, 1, 2]);
  const cardio = out[0];
  assert.deepEqual(cardio.topics.map((t) => [t.topic, t.label, t.n]), [
    ['chd', 'Congenital heart disease', 2],
    ['ecg', 'ECG', 1],
  ]);
  assert.deepEqual(cardio.topics[0].cards.map((c) => c._key), ['b', 'c']);
  // No topic label: the card's title stands in.
  const other = out[2];
  assert.ok(other.topics.some((t) => t.label === 'Mystery'));
  assert.ok(other.topics.some((t) => t.label === 'Odd things'));
  assert.deepEqual(groupBySystem([], chapters), []);
});

test('mergeSource makes a waiting skeleton for a new picture', () => {
  const card = mergeSource(null, { src: Q, img: 'u', field: 'exp_img', chapter: 'Cardiology', topic: 'chd', topic_label: 'CHD', science: 'Anatomy', now: NOW });
  assert.deepEqual(card, {
    img: 'u',
    title: '',
    caption: '',
    kind: 'other',
    chapter: 'Cardiology',
    topic: 'chd',
    topic_label: 'CHD',
    science: 'Anatomy',
    credit: '',
    status: 'waiting',
    sources: { 'q~abc': Q },
    field: 'exp_img',
    added: NOW,
    updated: NOW,
  });
});

test('mergeSource adds a source and keeps what a person or the model wrote', () => {
  const old = {
    img: 'u',
    title: 'Erythema migrans',
    caption: 'Bull-eye rash.',
    kind: 'skin',
    chapter: '',
    topic: '',
    topic_label: '',
    credit: 'CDC',
    status: 'checked',
    sources: { 'q~abc': Q },
    field: 'exp_img',
    added: 1,
    updated: 1,
  };
  const next = mergeSource(old, { src: C, img: 'other', field: 'back_img', chapter: 'Infectious disease', topic: 'lyme', topic_label: 'Lyme', now: NOW });
  assert.equal(next.title, 'Erythema migrans');
  assert.equal(next.caption, 'Bull-eye rash.');
  assert.equal(next.credit, 'CDC');
  assert.equal(next.status, 'checked');
  assert.equal(next.kind, 'skin');
  assert.equal(next.img, 'u');
  assert.equal(next.field, 'exp_img');
  assert.equal(next.added, 1);
  assert.equal(next.updated, NOW);
  assert.deepEqual(Object.keys(next.sources).sort(), ['c~d1~k2', 'q~abc']);
  // Blank chapter and topic are filled in; an existing one is kept.
  assert.equal(next.chapter, 'Infectious disease');
  assert.equal(next.topic, 'lyme');
  const again = mergeSource(next, { src: Q, img: 'u', field: 'img', chapter: 'Cardiology', topic: 'x', topic_label: 'X', now: NOW + 1 });
  assert.equal(again.chapter, 'Infectious disease');
  assert.equal(Object.keys(again.sources).length, 2);
  // The input is not changed.
  assert.deepEqual(Object.keys(old.sources), ['q~abc']);
  assert.equal(old.updated, 1);
});

test('removeSource hides a card once no source is left', () => {
  const card = { status: 'auto', sources: { 'q~abc': Q, 'c~d1~k2': C }, updated: 1 };
  const one = removeSource(card, 'q~abc', NOW);
  assert.deepEqual(Object.keys(one.sources), ['c~d1~k2']);
  assert.equal(one.status, 'auto');
  assert.equal(one.updated, NOW);
  const none = removeSource(one, 'c~d1~k2', NOW + 1);
  assert.deepEqual(none.sources, {});
  assert.equal(none.status, 'hidden');
  assert.equal(removeSource({ status: 'checked', sources: { 'q~abc': Q } }, 'q~abc', NOW).status, 'hidden');
  assert.equal(removeSource({ status: 'waiting', sources: { 'q~abc': Q } }, 'q~abc', NOW).status, 'hidden');
  // Removing an unknown key changes nothing but the time.
  assert.equal(removeSource(card, 'q~zzz', NOW).status, 'auto');
  assert.deepEqual(Object.keys(card.sources).length, 2);
});

test('questionSourceLabel drops blanks and repeats', () => {
  assert.equal(questionSourceLabel({ bank: 'DOH (HAAD)', group: '', book: '30 Jan 2023', quiz: '30 Jan 2023', n: 33 }), 'DOH (HAAD) › 30 Jan 2023 · Q33');
  assert.equal(questionSourceLabel({ bank: 'A', group: 'B', book: 'C', quiz: 'D', n: 5 }), 'A › B › C › D · Q5');
  assert.equal(questionSourceLabel({ bank: 'a', group: ' A ', book: 'C', quiz: '', n: 1 }), 'a › C · Q1');
  assert.equal(questionSourceLabel({ bank: 'A', quiz: 'D' }), 'A › D');
  assert.equal(questionSourceLabel({ n: 2 }), 'Q2');
  assert.equal(questionSourceLabel({}), '');
});

test('captionPrompt tells the model to use only the question text', () => {
  const { system, user } = captionPrompt({ stem: 'A  child has\nthis rash.', answer: 'Erythema migrans', explanation: '', field: 'question_img' });
  assert.equal(typeof system, 'string');
  assert.match(system, /ONLY/);
  assert.match(system, /"ok"/);
  assert.match(system, /skin, syndrome, xray, ecg, micro, sign, drawing, other/);
  assert.match(user, /A child has this rash\./);
  assert.match(user, /Erythema migrans/);
  assert.match(user, /question/);
  assert.match(captionPrompt({ stem: 's', answer: 'a', explanation: 'e', field: 'exp_img' }).user, /explanation/);
});

test('parseCaptionReply reads plain and fenced JSON', () => {
  const plain = parseCaptionReply('{"title":"Erythema migrans","caption":"Bull-eye rash.","kind":"skin","ok":true}');
  assert.deepEqual(plain, { title: 'Erythema migrans', caption: 'Bull-eye rash.', kind: 'skin', ok: true });
  const fenced = parseCaptionReply('Here you go:\n```json\n{"title":"AF","caption":"Irregular.","kind":"ecg","ok":true}\n```');
  assert.equal(fenced.kind, 'ecg');
  assert.equal(fenced.title, 'AF');
  assert.equal(parseCaptionReply('```\n{"title":"X","caption":"y","kind":"xray","ok":true}\n```').kind, 'xray');
  assert.equal(parseCaptionReply('Sure: {"title":"X","caption":"y","kind":"sign","ok":true} done').kind, 'sign');
});

test('parseCaptionReply fixes a bad kind, trims a long caption and refuses non-JSON', () => {
  assert.equal(parseCaptionReply('{"title":"X","caption":"y","kind":"banana","ok":true}').kind, 'other');
  assert.equal(parseCaptionReply('{"title":"X","caption":"y","ok":true}').kind, 'other');
  const long = parseCaptionReply(JSON.stringify({ title: 'X', caption: 'a'.repeat(500), kind: 'skin', ok: true }));
  assert.ok(long.caption.length <= 300);
  const no = parseCaptionReply('{"title":"","caption":"","kind":"other","ok":false}');
  assert.equal(no.ok, false);
  assert.equal(parseCaptionReply('{"title":"","caption":"","kind":"skin","ok":true}').ok, false);
  assert.equal(parseCaptionReply('not json at all'), null);
  assert.equal(parseCaptionReply(''), null);
  assert.equal(parseCaptionReply(null), null);
  assert.equal(parseCaptionReply('[1,2]'), null);
  assert.equal(parseCaptionReply('{broken'), null);
});

import { isDrawing, shortCaption, examCount } from '../../functions/ospeCore.js';

test('OSPE keeps real photos only', () => {
  assert.equal(isDrawing({ credit: 'Illustration: Easy Pedia', img: 'https://x/a.png' }), true);
  assert.equal(isDrawing({ credit: 'Photo: CDC, PHIL #1 (public domain)', img: 'https://x/a.jpg' }), false);
  assert.equal(isDrawing({ credit: '', img: 'https://x/a.svg' }), true);
  const vis = visibleCards({ a: { status: 'checked', img: 'u', credit: 'Illustration: Easy Pedia' }, b: { status: 'checked', img: 'v', credit: 'Photo: CDC' } });
  assert.deepEqual(vis.map((c) => c._key), ['b']);
});

test('short caption and exam count', () => {
  assert.equal(shortCaption('Vesicles on palms. Coxsackie A16.'), 'Vesicles on palms.');
  assert.equal(shortCaption('No full stop'), 'No full stop');
  assert.equal(examCount({ sources: { a: { type: 'q', quiz: 'p1' }, b: { type: 'q', quiz: 'p1' }, c: { type: 'q', quiz: 'p2' }, d: { type: 'card', label: 'x' } } }), 2);
});

test('source paths drop the question number; the name is the last part', () => {
  assert.equal(sourcePath('MRCPCH › AKP › AKP Recalls › AKP Recall Jan 2024 · Q12'), 'MRCPCH › AKP › AKP Recalls › AKP Recall Jan 2024');
  assert.equal(sourceName('MRCPCH › AKP › AKP Recalls › AKP Recall Jan 2024 · Q12'), 'AKP Recall Jan 2024');
  assert.equal(sourceName('Flashcards › AKP Images › AKP ECGs'), 'AKP ECGs');
  assert.equal(sourcePath(''), '');
});

test('a picture used twice in one exam counts once for that exam', () => {
  const card = { sources: { a: { label: 'Bank › Quiz 2 · Q1' }, b: { label: 'Bank › Quiz 2 · Q7' }, c: { label: 'Flashcards › Deck' } } };
  assert.deepEqual(sourcePaths(card), ['Bank › Quiz 2', 'Flashcards › Deck']);
});

test('groupBySource lists every exam or deck by name, numbers in order', () => {
  const cards = [
    { sources: { a: { label: 'Bank › Quiz 10 · Q1' } } },
    { sources: { a: { label: 'Bank › Quiz 2 · Q3' }, b: { label: 'Bank › Quiz 10 · Q4' } } },
  ];
  assert.deepEqual(groupBySource(cards), [
    { path: 'Bank › Quiz 2', name: 'Quiz 2', from: 'Bank', n: 1 },
    { path: 'Bank › Quiz 10', name: 'Quiz 10', from: 'Bank', n: 2 },
  ]);
});

test('basic science defaults to Clinical and follows the given order', () => {
  assert.equal(ospeScience({}), 'Clinical');
  assert.equal(ospeScience({ science: 'Anatomy' }), 'Anatomy');
  const cards = [{ science: 'Physiology' }, {}, { science: 'Anatomy' }, { science: 'Anatomy' }, { science: 'Zoology' }];
  assert.deepEqual(groupByScience(cards, ['Clinical', 'Anatomy', 'Physiology']), [
    { science: 'Clinical', n: 1 },
    { science: 'Anatomy', n: 2 },
    { science: 'Physiology', n: 1 },
    { science: 'Zoology', n: 1 },
  ]);
});
