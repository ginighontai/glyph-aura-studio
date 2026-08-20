import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFilename, formatBytes, isTransparentCapable, describeExport } from '../src/lib/export/exporters.ts';

const name = (overrides = {}) =>
  buildFilename({
    text: 'Golden Hour',
    script: 'Latin',
    format: 'png',
    scale: 2,
    transparent: false,
    width: 1440,
    height: 1800,
    ...overrides,
  });

test('filenames carry the dimensions, script, scale and alpha flag', () => {
  assert.equal(name(), 'glyphaura_golden-hour_latin_1440x1800_2x.png');
  assert.equal(name({ scale: 1 }), 'glyphaura_golden-hour_latin_1440x1800.png');
  assert.equal(
    name({ transparent: true, format: 'svg' }),
    'glyphaura_golden-hour_latin_1440x1800_alpha.svg',
  );
});

test('Indic vowel signs survive the slug — they are marks, not letters', () => {
  // Regression: \p{L}-only slugs turned আমি into আম and मंदिर into मदर.
  const bengali = name({ text: 'আমি বাংলায় গান গাই', script: 'Bengali' });
  assert.ok(bengali.includes('আমি'), bengali);
  assert.ok(bengali.includes('বাংলায়'), bengali);
  assert.ok(!bengali.includes('আম-'), 'the i-kar must not be stripped');

  const hindi = name({ text: 'शुभ विवाह', script: 'Devanagari' });
  assert.ok(hindi.includes('शुभ'), hindi);
  assert.ok(hindi.includes('विवाह'), hindi);

  const conjunct = name({ text: 'জন্মদিন', script: 'Bengali' });
  assert.ok(conjunct.includes('জন্মদিন'), conjunct);
});

test('slugs stay filesystem-safe', () => {
  const messy = name({ text: '  Hello / World: "quoted" \n <tags> & 100%  ' });
  assert.match(messy, /^glyphaura_[^/\\:"<>|?*]+\.png$/);
  assert.ok(!messy.includes('//'));
  assert.equal(name({ text: '!!!' }).startsWith('glyphaura_poster_'), true);
});

test('long text is truncated without leaving an orphaned mark', () => {
  const long = name({ text: 'আমি'.repeat(40), script: 'Bengali' });
  assert.ok(long.length < 120);
  assert.ok(!/[\u0980-\u09ff]?[\u09be-\u09cc]_/.test(long));
});

test('helpers report honestly', () => {
  assert.equal(isTransparentCapable('png'), true);
  assert.equal(isTransparentCapable('svg'), true);
  assert.equal(isTransparentCapable('jpg'), false);
  assert.equal(formatBytes(900), '900 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');

  const output = { width: 1350, height: 1688 };
  assert.equal(
    describeExport(output, { format: 'png', scale: 2 }),
    '2700 × 3376px',
  );
  assert.equal(
    describeExport(output, { format: 'svg', scale: 2 }),
    '1350 × 1688 vector units',
  );
});
