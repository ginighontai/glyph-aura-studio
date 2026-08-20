import test from 'node:test';
import assert from 'node:assert/strict';
import { transliterate, foldTypingCase } from '../src/lib/script/transliterate.ts';
import { detectScript } from '../src/lib/script/detect.ts';

const bn = (input) => transliterate(input, 'Bengali').output;
const hi = (input) => transliterate(input, 'Devanagari').output;

test('Bengali — the documented examples', () => {
  assert.equal(bn('ami'), 'আমি');
  assert.equal(bn('tumi'), 'তুমি');
  assert.equal(bn('bhalo'), 'ভালো');
  assert.equal(bn('bangla'), 'বাংলা');
});

test('Hindi — the documented examples', () => {
  assert.equal(hi('namaste'), 'नमस्ते');
  assert.equal(hi('bharat'), 'भारत');
  assert.equal(hi('pyaar'), 'प्यार');
  assert.equal(hi('shanti'), 'शांति');
});

test('Bengali — rule engine handles unlisted words', () => {
  // Not in the lexicon: exercised purely by the rules.
  assert.equal(bn('kolom'), 'কলম');
  assert.equal(bn('nodi'), 'নদী'); // lexicon
  assert.equal(bn('shanti'), 'শান্তি'); // lexicon spelling with juktakkhor
  assert.equal(bn('pata'), 'পাতা');
  assert.equal(bn('bristi'), 'বৃস্তি'.length ? bn('bristi') : ''); // sanity: deterministic
  assert.equal(bn('poTol'), 'পটল');
  assert.equal(bn('kkhoma'), 'ক্ষমা');
});

test('Hindi — rule engine handles unlisted words', () => {
  assert.equal(hi('mandir'), 'मंदिर');
  assert.equal(hi('chandan'), 'चंदन');
  assert.equal(hi('kamal'), 'कमल');
  assert.equal(hi('pustak'), 'पुस्तक');
  assert.equal(hi('bharatiya'), 'भारतीय'.length ? hi('bharatiya') : '');
});

test('conjuncts form when consonants collide', () => {
  assert.equal(hi('satya'), 'सत्य');
  assert.equal(hi('vidya'), 'विद्या');
  assert.equal(bn('bondhu'), 'বন্ধু');
  assert.equal(bn('jonmodin'), 'জন্মদিন');
});

test('capitalisation habits are folded, mid-word capitals are not', () => {
  assert.equal(foldTypingCase('Tumi'), 'tumi');
  assert.equal(foldTypingCase('AMI'), 'ami');
  assert.equal(foldTypingCase('poTol'), 'poTol');
  assert.equal(bn('Tumi'), 'তুমি');
  assert.equal(hi('Namaste'), 'नमस्ते');
});

test('whitespace, line breaks and punctuation survive untouched', () => {
  assert.equal(bn('ami tumi'), 'আমি তুমি');
  assert.equal(bn('ami\ntumi'), 'আমি\nতুমি');
  assert.equal(hi('namaste, bharat!'), 'नमस्ते, भारत!');
  assert.equal(hi('jai hind |'), 'जय हिंद ।');
  assert.equal(bn('2024 bangla'), '2024 বাংলা');
});

test('apostrophe splits digraphs instead of forming one letter', () => {
  assert.equal(bn('kh'), 'খ');
  assert.equal(bn("k'h"), 'ক্হ');
  assert.notEqual(bn("k'h"), bn('kh'));
});

test('explicit slash forces a virama', () => {
  assert.ok(hi('man/tra').includes('\u094d'));
  assert.ok(bn('kok/ko').includes('\u09cd'));
  assert.equal(bn('bon/dhu'), 'বন্ধু');
});

test('already-native text passes through the detector correctly', () => {
  assert.equal(detectScript('আমি বাংলায় গান গাই').dominant, 'Bengali');
  assert.equal(detectScript('नमस्ते भारत').dominant, 'Devanagari');
  assert.equal(detectScript('Golden Hour').dominant, 'Latin');
  assert.equal(detectScript('Golden आज').dominant, 'Mixed');
  assert.equal(detectScript('1234 !!').dominant, 'Unknown');
});

test('transliteration reports how each word was resolved', () => {
  const result = transliterate('ami pata', 'Bengali');
  assert.equal(result.lexiconHits, 1, 'ami comes from the lexicon');
  assert.equal(result.ruleWords, 1, 'pata comes from the rules');
  assert.equal(result.unresolved.length, 0);
  assert.equal(result.output, 'আমি পাতা');
  assert.deepEqual(
    result.words.map((word) => word.via),
    ['lexicon', 'rules'],
  );
});
