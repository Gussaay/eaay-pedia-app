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
