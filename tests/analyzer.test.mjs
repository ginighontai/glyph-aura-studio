import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFeatures } from '../src/lib/analysis/features.ts';
import { analyzeLocally } from '../src/lib/analysis/localAnalyzer.ts';
import { kMeansPalette, contrastRatio, hexToRgb } from '../src/lib/analysis/color.ts';

function makeImage(width, height, [r, g, b] = [255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = r;
    data[index * 4 + 1] = g;
    data[index * 4 + 2] = b;
    data[index * 4 + 3] = 255;
  }
  return { width, height, data };
}

function fillRect(image, x0, y0, w, h, [r, g, b]) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const index = (y * image.width + x) * 4;
      image.data[index] = r;
      image.data[index + 1] = g;
      image.data[index + 2] = b;
      image.data[index + 3] = 255;
    }
  }
}

/** Five upright bars: a stand-in for a monoline sans headline. */
function barsImage({ slantDegrees = 0, barWidth = 12, ink = [20, 20, 24], paper = [250, 249, 246] } = {}) {
  const image = makeImage(300, 300, paper);
  const top = 60;
  const bottom = 240;
  const centreY = 150;
  const shear = Math.tan((slantDegrees * Math.PI) / 180);
  for (let bar = 0; bar < 5; bar += 1) {
    const baseX = 55 + bar * 40;
    for (let y = top; y < bottom; y += 1) {
      const x = Math.round(baseX + shear * (centreY - y));
      fillRect(image, x, y, barWidth, 1, ink);
    }
  }
  return image;
}

test('stroke width is measured from the pixels', () => {
  const features = extractFeatures(barsImage({ barWidth: 12 }));
  assert.equal(features.darkOnLight, true);
  assert.ok(
    Math.abs(features.strokeWidthPx - 12) <= 1,
    `expected ~12px strokes, measured ${features.strokeWidthPx}`,
  );
  assert.ok(features.strokeContrastRatio < 1.3, 'monoline bars should read as low contrast');
  assert.ok(features.edgeRoughness < 0.2, `clean rectangles should be smooth, got ${features.edgeRoughness}`);
});

test('heavier strokes read as heavier strokes', () => {
  const light = extractFeatures(barsImage({ barWidth: 6 }));
  const heavy = extractFeatures(barsImage({ barWidth: 26 }));
  assert.ok(heavy.strokeWidthPx > light.strokeWidthPx * 2);
  assert.ok(heavy.weightRatio > light.weightRatio);
});

test('slant is recovered, with the right sign', () => {
  const upright = extractFeatures(barsImage({ slantDegrees: 0 }));
  assert.ok(Math.abs(upright.slantDegrees) <= 2, `upright bars measured ${upright.slantDegrees}°`);

  const rightLeaning = extractFeatures(barsImage({ slantDegrees: 16 }));
  assert.ok(
    Math.abs(rightLeaning.slantDegrees - 16) <= 4,
    `expected ~+16°, measured ${rightLeaning.slantDegrees}°`,
  );

  const leftLeaning = extractFeatures(barsImage({ slantDegrees: -14 }));
  assert.ok(
    Math.abs(leftLeaning.slantDegrees + 14) <= 4,
    `expected ~-14°, measured ${leftLeaning.slantDegrees}°`,
  );
});

test('ink and paper are separated even when the artwork is inverted', () => {
  const positive = extractFeatures(barsImage({ ink: [12, 14, 20], paper: [252, 250, 245] }));
  assert.equal(positive.darkOnLight, true);
  assert.ok(hexToRgb(positive.inkPalette[0].hex).r < 60);
  assert.ok(hexToRgb(positive.backgroundPalette[0].hex).r > 200);

  const negative = extractFeatures(barsImage({ ink: [245, 240, 230], paper: [16, 16, 20] }));
  assert.equal(negative.darkOnLight, false);
  assert.ok(hexToRgb(negative.inkPalette[0].hex).r > 200, 'ink cluster should be the light strokes');
  assert.ok(hexToRgb(negative.backgroundPalette[0].hex).r < 60);
});

test('lines and hierarchy are counted', () => {
  const image = makeImage(400, 400, [255, 255, 255]);
  // A big headline and a small subhead: two lines, two size levels.
  for (let bar = 0; bar < 4; bar += 1) fillRect(image, 60 + bar * 40, 60, 16, 120, [10, 10, 10]);
  for (let bar = 0; bar < 6; bar += 1) fillRect(image, 60 + bar * 24, 260, 8, 40, [10, 10, 10]);

  const features = extractFeatures(image);
  assert.equal(features.lineBoxes.length, 2);
  assert.equal(features.hierarchyLevels, 2);
});

test('the Indic headline heuristic fires on a top bar and not on Latin-like stems', () => {
  const plain = extractFeatures(barsImage());
  assert.ok(plain.headlineScore < 0.2, `upright stems should not look Indic (${plain.headlineScore})`);

  const withHeadline = makeImage(300, 300, [255, 255, 255]);
  fillRect(withHeadline, 50, 90, 200, 9, [10, 10, 10]); // shirorekha
  for (let bar = 0; bar < 5; bar += 1) fillRect(withHeadline, 60 + bar * 40, 99, 10, 70, [10, 10, 10]);
  const indic = extractFeatures(withHeadline);
  assert.ok(indic.headlineScore > 0.3, `expected a headline signal, got ${indic.headlineScore}`);
});

test('background structure is classified', () => {
  const flat = extractFeatures(barsImage());
  assert.equal(flat.backgroundKind, 'flat');

  const gradient = makeImage(300, 300);
  for (let y = 0; y < 300; y += 1) {
    const value = Math.round(40 + (y / 299) * 200);
    fillRect(gradient, 0, y, 300, 1, [value, value, value]);
  }
  for (let bar = 0; bar < 4; bar += 1) fillRect(gradient, 70 + bar * 40, 120, 12, 80, [250, 40, 40]);
  assert.equal(extractFeatures(gradient).backgroundKind, 'linear');
});

test('alignment falls out of the line boxes', () => {
  const image = makeImage(400, 400);
  fillRect(image, 40, 60, 200, 40, [0, 0, 0]);
  fillRect(image, 40, 160, 120, 40, [0, 0, 0]);
  fillRect(image, 40, 260, 260, 40, [0, 0, 0]);
  assert.equal(extractFeatures(image).alignment, 'left');

  const centred = makeImage(400, 400);
  fillRect(centred, 100, 60, 200, 40, [0, 0, 0]);
  fillRect(centred, 140, 160, 120, 40, [0, 0, 0]);
  fillRect(centred, 70, 260, 260, 40, [0, 0, 0]);
  assert.equal(extractFeatures(centred).alignment, 'center');
});

test('analyzeLocally produces a complete, valid Style DNA', () => {
  const { dna, meta } = analyzeLocally(barsImage(), { sourceName: 'bars.png' });

  assert.equal(meta.engine, 'local-heuristic');
  assert.equal(meta.sourceName, 'bars.png');
  assert.equal(dna.detectedScript, 'Unknown');
  assert.equal(dna.typographyCategory, 'sans-serif');
  assert.equal(dna.renderHints.fontCategory, 'sans');
  assert.ok(dna.confidenceScore > 0 && dna.confidenceScore <= 1);
  assert.ok(dna.userWarnings.length >= 1);
  assert.ok(dna.generationPrompt.length > 80);
  assert.ok(dna.negativePrompt.includes('misspelled'));

  for (const hex of [...dna.colorProfile.primaryColors, ...dna.colorProfile.backgroundColors]) {
    assert.match(hex, /^#[0-9a-f]{6}$/, `${hex} should be a normalised hex colour`);
  }
  for (const key of [
    'strokeProfile',
    'formProfile',
    'colorProfile',
    'effectsProfile',
    'compositionProfile',
    'renderHints',
  ]) {
    assert.ok(dna[key] && typeof dna[key] === 'object', `${key} must be present`);
  }
  assert.ok(dna.renderHints.weight >= 100 && dna.renderHints.weight <= 900);
});

test('a forced script hint is respected', () => {
  const { dna } = analyzeLocally(barsImage(), { scriptHint: 'Bengali' });
  assert.equal(dna.detectedScript, 'Bengali');
});

test('palette extraction is deterministic and weighted', () => {
  const samples = [];
  for (let index = 0; index < 300; index += 1) samples.push({ r: 10, g: 12, b: 14 });
  for (let index = 0; index < 100; index += 1) samples.push({ r: 220, g: 30, b: 40 });
  const first = kMeansPalette(samples, 3);
  const second = kMeansPalette(samples, 3);
  assert.deepEqual(first, second, 'same input must always give the same palette');
  assert.ok(first[0].weight > first[1].weight);
  assert.ok(first[0].weight > 0.7);
  assert.ok(contrastRatio(hexToRgb(first[0].hex), hexToRgb('#ffffff')) > 10);
});
