import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browseFields, chapterOf, normalizeChapter, scienceOf, setId, setTitle } from './questionBrowse.js';

test('old category names map to chapters', () => {
  assert.equal(normalizeChapter('CNS'), 'Neurology');
  assert.equal(normalizeChapter('cardiology'), 'Cardiology');
  assert.equal(normalizeChapter('Pediatric Drugs'), 'Clinical pharmacology & therapeutics');
  assert.equal(normalizeChapter('mdical statistics'), 'Research & statistics');
  assert.equal(normalizeChapter('Respiratory '), 'Respiratory');
  assert.equal(normalizeChapter(''), '');
  assert.equal(normalizeChapter('Anatomy'), '');
});

test('a question with no category gets a chapter from its text', () => {
  assert.equal(chapterOf({ question: 'A child has a murmur and a cyanotic heart lesion. What is it?' }), 'Cardiology');
  assert.equal(chapterOf({ question: 'Tell me something.' }), 'Other');
});

test('basic-science sections', () => {
  assert.equal(scienceOf({ question: 'What is the mechanism of action of omeprazole?' }), 'Pharmacology');
  assert.equal(scienceOf({ question: 'Which organism is a Gram-negative diplococcus?' }), 'Microbiology');
  assert.equal(scienceOf({ question: 'What is the mode of inheritance?' }), 'Genetics');
  assert.equal(scienceOf({ question: 'What is the most likely diagnosis?' }), 'Clinical');
  assert.equal(scienceOf({ question: 'Which statement is true?', category1: 'Anatomy' }), 'Anatomy');
  assert.equal(scienceOf({ question: 'What is the most likely diagnosis?', science: 'Physiology', science_manual: true }), 'Physiology');
});

test('browse fields carry the bank', () => {
  const f = browseFields({ question: 'What is the mechanism of action of omeprazole?', category1: 'GIT' }, 'mrcpch');
  assert.deepEqual(f, {
    chapter: 'Gastroenterology & hepatology',
    science: 'Pharmacology',
    bchap: 'mrcpch|Gastroenterology & hepatology',
    bsci: 'mrcpch|Pharmacology',
  });
});

test('set ids are database-safe and stable', () => {
  const id = setId({ bank: 'mrcpch', chapter: 'Pain, anaesthesia & palliative care', science: 'Pharmacology' });
  assert.equal(id, 'set_mrcpch_all_pain-anaesthesia-palliative-care_pharmacology');
  assert.match(id, /^[A-Za-z0-9_-]+$/);
  assert.equal(setTitle({ chapter: 'Cardiology', science: 'Clinical' }), 'Cardiology · Clinical (bedside)');
});

test('practice filters combine and use each repeated question once', async () => {
  const { practiceFilter, practiceCounts, uniqueQuestions, parseFilter, batchOf, batchCount, setId } = await import('./questionBrowse.js');
  const list = [
    { _key: 'a', same: { b: true } },
    { _key: 'b', same_as: 'a', same: { a: true } },
    { _key: 'c', similar: { d: true } },
    { _key: 'd' },
    { _key: 'e' },
  ];
  assert.deepEqual(uniqueQuestions(list).map((q) => q._key), ['a', 'c', 'd', 'e']);
  // repeated = asked again or with a similar question
  assert.deepEqual(practiceFilter(list, 'linked').map((q) => q._key), ['a', 'c']);
  assert.deepEqual(practiceFilter(list, 'unlinked').map((q) => q._key), ['d', 'e']);
  // answering a copy counts for the original
  const history = { b: 0, c: 1, d: 1 };
  assert.deepEqual(practiceFilter(list, 'unanswered', history).map((q) => q._key), ['e']);
  assert.deepEqual(practiceFilter(list, 'linked+wrong', history).map((q) => q._key), ['a']);
  assert.deepEqual(practiceFilter(list, 'unlinked+correct', history).map((q) => q._key), ['d']);
  assert.deepEqual(practiceFilter(list, 'unlinked+unanswered', history).map((q) => q._key), ['e']);
  // older names still work
  assert.deepEqual(parseFilter('notsimilar'), { link: 'unlinked', answer: '', times: 0 });
  const c = practiceCounts(list, history);
  assert.equal(c.linked[''], 2);
  assert.equal(c.copies.linked, 3);
  assert.equal(c[''].unanswered, 1);
  // batches of 100
  const many = Array.from({ length: 250 }, (_, i) => i);
  assert.equal(batchCount(250), 3);
  assert.deepEqual(batchOf(many, 3), many.slice(200));
  assert.match(setId({ bank: 'mrcpch', book: 'tasrecall', filter: 'linked+wrong', part: 2 }), /_linked-wrong_p2$/);
});

test('repeated at least N times', async () => {
  const { practiceFilter, timesAsked, parseFilter, makeFilter } = await import('./questionBrowse.js');
  const list = [
    { _key: 'a', same: { b: true, c: true }, similar: { x: true } },
    { _key: 'b', same_as: 'a', same: { a: true, c: true } },
    { _key: 'c', same_as: 'a', same: { a: true, b: true } },
    { _key: 'd', similar: { a: true } },
    { _key: 'e' },
  ];
  assert.equal(timesAsked(list[0]), 4);
  assert.equal(timesAsked(list[3]), 2);
  assert.equal(makeFilter({ times: 3, answer: 'wrong' }), 'linked+x3+wrong');
  assert.deepEqual(parseFilter('x3'), { link: 'linked', answer: '', times: 3 });
  assert.deepEqual(practiceFilter(list, 'x2').map((q) => q._key), ['a', 'd']);
  assert.deepEqual(practiceFilter(list, 'x3').map((q) => q._key), ['a']);
  assert.deepEqual(practiceFilter(list, 'x5').map((q) => q._key), []);
});
