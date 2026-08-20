import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutText, baselineOffset } from '../src/lib/render/layout.ts';
import { resolveEffectiveStyle } from '../src/lib/render/params.ts';
import { scoreFonts, selectFont, fontsForScript, FONT_LIBRARY } from '../src/lib/render/fonts.ts';
import { planOrnaments, pathToSvg, taperedOutline } from '../src/lib/render/flourish.ts';
import { resolveCanvasSize, scaledSize, describeOutput, previewSize } from '../src/lib/render/aspect.ts';
import { buildPrompt } from '../src/lib/prompt/build.ts';
import { compareTexts, similarity, normalizeForCompare, guaranteedReport } from '../src/lib/verify/fidelity.ts';
import { STYLE_PRESETS, presetById } from '../src/lib/presets/examples.ts';
import { DEFAULT_FIDELITY } from '../src/types/project.ts';
import { normalizeStyleDna } from '../src/types/styleDna.ts';
import { contrastRatio, hexToRgb } from '../src/lib/analysis/color.ts';

/** Stand-in for ctx.measureText: every glyph is half an em wide. */
const measure = (text, fontSize) => text.length * fontSize * 0.5;

const baseLayout = (overrides = {}) => ({
  text: 'GOLDEN HOUR',
  width: 1200,
  height: 800,
  marginRatio: 0.1,
  lineHeight: 1.1,
  alignment: 'center',
  hierarchyContrast: 0.6,
  measure,
  ...overrides,
});

test('layout fills the margin box without overflowing it', () => {
  const result = layoutText(baseLayout());
  const box = result.box;
  assert.equal(box.x, 120);
  assert.equal(box.width, 960);
  assert.ok(result.blockWidth <= box.width + 0.5, 'block must fit the box width');
  assert.ok(result.blockHeight <= box.height + 0.5, 'block must fit the box height');
  assert.ok(result.blockWidth > box.width * 0.9, `expected a snug fit, got ${result.blockWidth}`);
  assert.equal(result.overflow, false);
  assert.equal(result.clamped, false);
  // No characters are lost, whichever way the engine decides to break the line.
  assert.equal(result.lines.map((line) => line.text).join(' '), 'GOLDEN HOUR');
});

test('the engine breaks a line when that lets the type grow', () => {
  // A tall frame: stacking the two words doubles the achievable size, which is
  // what a poster designer would do by hand.
  const tall = layoutText(baseLayout({ width: 1200, height: 1600 }));
  assert.equal(tall.lines.length, 2);
  assert.ok(tall.lines[0].fontSize > 250);

  // A wide banner cannot afford the stack, so the words stay on one line.
  const wide = layoutText(baseLayout({ width: 1920, height: 700 }));
  assert.equal(wide.lines.length, 1);
  assert.equal(wide.lines[0].text, 'GOLDEN HOUR');
});

test('long text wraps on word boundaries and never splits a word', () => {
  const result = layoutText(
    baseLayout({ text: 'every glyph matters in a poster', height: 400, maxFontSize: 90 }),
  );
  assert.ok(result.lines.length > 1, 'should wrap');
  for (const line of result.lines) {
    assert.ok(line.width <= result.box.width + 0.5);
    assert.ok(!line.text.startsWith(' ') && !line.text.endsWith(' '));
  }
  const rejoined = result.lines.map((line) => line.text).join(' ');
  assert.equal(rejoined, 'every glyph matters in a poster', 'no characters may be lost while wrapping');
});

test('explicit line breaks are honoured and drive hierarchy', () => {
  const result = layoutText(baseLayout({ text: 'HARVEST\nMARKET', hierarchyContrast: 0.5 }));
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0].text, 'HARVEST');
  assert.equal(result.lines[1].text, 'MARKET');
  assert.ok(
    Math.abs(result.lines[1].fontSize / result.lines[0].fontSize - 0.5) < 0.01,
    'second block should be half the size at hierarchyContrast 0.5',
  );
  assert.ok(result.lines[1].top > result.lines[0].top);
});

test('alignment positions lines correctly', () => {
  const left = layoutText(baseLayout({ text: 'AB\nABCD', alignment: 'left' }));
  assert.ok(Math.abs(left.lines[0].x - left.box.x) < 0.01);
  assert.ok(Math.abs(left.lines[1].x - left.box.x) < 0.01);

  const right = layoutText(baseLayout({ text: 'AB\nABCD', alignment: 'right' }));
  for (const line of right.lines) {
    assert.ok(Math.abs(line.x + line.width - (right.box.x + right.box.width)) < 0.01);
  }

  const centre = layoutText(baseLayout({ text: 'AB\nABCD', alignment: 'center' }));
  for (const line of centre.lines) {
    const lineCentre = line.x + line.width / 2;
    assert.ok(Math.abs(lineCentre - (centre.box.x + centre.box.width / 2)) < 0.01);
  }
});

test('the block is vertically centred in the margin box', () => {
  const result = layoutText(baseLayout({ text: 'ONE\nTWO', height: 1000 }));
  const top = result.lines[0].top;
  const bottom = result.lines[result.lines.length - 1].top + result.lines[result.lines.length - 1].height;
  const above = top - result.box.y;
  const below = result.box.y + result.box.height - bottom;
  assert.ok(Math.abs(above - below) < 1, `expected balanced space, got ${above} / ${below}`);
});

test('impossible text reports clamped instead of silently overflowing', () => {
  const result = layoutText(
    baseLayout({ text: 'x'.repeat(4000), width: 300, height: 120, maxFontSize: 200 }),
  );
  assert.equal(result.clamped, true);
  assert.equal(result.overflow, true);
});

test('baseline jitter is deterministic and bounded', () => {
  assert.equal(baselineOffset(3, 0, 100), 0);
  const first = baselineOffset(3, 0.02, 100);
  assert.equal(first, baselineOffset(3, 0.02, 100));
  assert.ok(Math.abs(first) <= 2.0001);
  assert.notEqual(first, baselineOffset(4, 0.02, 100));
});

/* ------------------------------------------------------------ font selection */

test('font selection never returns a face that lacks the script', () => {
  for (const preset of STYLE_PRESETS) {
    for (const script of ['Latin', 'Bengali', 'Devanagari']) {
      const { font } = selectFont(preset.dna, script);
      assert.ok(
        font.scripts.includes(script),
        `${preset.id} on ${script} chose ${font.family}, which does not cover ${script}`,
      );
    }
  }
});

test('every script has real bundled coverage', () => {
  assert.ok(fontsForScript('Latin').length >= 10);
  assert.ok(fontsForScript('Bengali').length >= 6);
  assert.ok(fontsForScript('Devanagari').length >= 6);
  assert.equal(FONT_LIBRARY.length, 30);
});

test('the analysed shape family drives the pick', () => {
  const blackletter = normalizeStyleDna({
    typographyCategory: 'gothic',
    renderHints: { fontCategory: 'blackletter', weight: 400, strokeContrastRatio: 5 },
    formProfile: { slant: 'upright, 0°' },
  });
  assert.equal(selectFont(blackletter, 'Latin').font.id, 'unifraktur-maguntia');

  const brushBengali = presetById('wet-brush-bengali');
  const chosen = selectFont(brushBengali.dna, 'Bengali').font;
  assert.ok(['galada', 'atma'].includes(chosen.id), `expected a brush Bangla face, got ${chosen.id}`);

  const swiss = presetById('swiss-poster');
  assert.equal(selectFont(swiss.dna, 'Latin').font.category, 'sans');
});

test('an all-caps face is not chosen for mixed-case reference text', () => {
  const lowercase = normalizeStyleDna({
    detectedReferenceText: 'midnight diner',
    typographyCategory: 'sans-serif',
    renderHints: { fontCategory: 'display', weight: 400, uppercase: false },
  });
  const ranked = scoreFonts(lowercase, 'Latin');
  const bebas = ranked.find((entry) => entry.font.id === 'bebas-neue');
  const anton = ranked.find((entry) => entry.font.id === 'anton');
  assert.ok(bebas.score < anton.score, 'the caps-only face should rank below the lowercase-capable one');
});

test('a hand-picked font overrides the automatic choice', () => {
  const preset = presetById('swiss-poster');
  const forced = selectFont(preset.dna, 'Latin', 'great-vibes');
  assert.equal(forced.font.id, 'great-vibes');
});

/* --------------------------------------------------------- effective styling */

const resolve = (overrides = {}) =>
  resolveEffectiveStyle({
    dna: presetById('wet-brush-bengali').dna,
    script: 'Bengali',
    fidelity: DEFAULT_FIDELITY,
    mode: 'faithful',
    transparent: false,
    ...overrides,
  });

test('colour matching at zero renders monochrome, at full keeps the palette', () => {
  const exact = resolve({ fidelity: { ...DEFAULT_FIDELITY, colorMatching: 100 } });
  assert.equal(exact.inkColors[0], '#1d2b53');

  const mono = resolve({
    fidelity: { ...DEFAULT_FIDELITY, colorMatching: 0, textReadability: 0 },
  });
  const rgb = hexToRgb(mono.inkColors[0]);
  const spread = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
  assert.ok(spread < 12, `expected a neutral ink, got ${mono.inkColors[0]}`);
});

test('style strength at zero returns to neutral typography', () => {
  const neutral = resolve({ fidelity: { ...DEFAULT_FIDELITY, styleStrength: 0 } });
  assert.equal(neutral.slantDegrees, 0);
  assert.equal(neutral.nibWidthEm, 0);
  assert.equal(neutral.gradient, null);
  assert.ok(Math.abs(neutral.strokeContrastRatio - 1) < 1e-9);
});

test('high readability guarantees usable figure-ground contrast', () => {
  const lowContrast = normalizeStyleDna({
    colorProfile: { primaryColors: ['#8d8d90'], backgroundColors: ['#a0a0a4'] },
    renderHints: { fontCategory: 'sans', weight: 700 },
  });
  const style = resolveEffectiveStyle({
    dna: lowContrast,
    script: 'Latin',
    fidelity: { ...DEFAULT_FIDELITY, textReadability: 100 },
    mode: 'faithful',
    transparent: false,
  });
  const ratio = contrastRatio(hexToRgb(style.inkColors[0]), hexToRgb(style.background.colors[0]));
  assert.ok(ratio > 3, `readability guard should lift contrast, got ${ratio.toFixed(2)}:1`);
});

test('texture and roughness sliders reach zero and full', () => {
  const clean = resolve({
    fidelity: { ...DEFAULT_FIDELITY, textureIntensity: 0, brushRoughness: 0 },
  });
  assert.equal(clean.paperTexture, 0);
  assert.equal(clean.grain, 0);
  assert.equal(clean.edgeRoughness, 0);

  const tactile = resolve({
    fidelity: { ...DEFAULT_FIDELITY, textureIntensity: 100, brushRoughness: 100, textReadability: 0 },
  });
  assert.ok(tactile.paperTexture > 0.5);
  assert.ok(tactile.edgeRoughness > 0.4);
});

test('generation modes actually change the output', () => {
  const vector = resolve({ mode: 'vector-logo' });
  assert.equal(vector.paperTexture, 0);
  assert.equal(vector.grain, 0);
  assert.equal(vector.inkBleed, 0);
  assert.equal(vector.gradient, null);
  assert.equal(vector.vectorFriendly, true);

  const sticker = resolve({ mode: 'transparent-sticker' });
  assert.equal(sticker.background, null);
  assert.equal(sticker.transparent, true);
  assert.ok(sticker.outline && sticker.outline.widthEm > 0, 'stickers get a die-cut contour');

  const artistic = resolve({ mode: 'artistic' });
  const clean = resolve({ mode: 'clean-poster' });
  assert.ok(artistic.ornamentation > clean.ornamentation);
  assert.ok(artistic.edgeRoughness > clean.edgeRoughness);
});

test('transparency and export overrides suppress the ground and effects', () => {
  assert.equal(resolve({ transparent: true }).background, null);
  const typographyOnly = resolve({ typographyOnly: true, preserveEffects: false });
  assert.equal(typographyOnly.background, null);
  assert.equal(typographyOnly.shadow, null);
  assert.equal(typographyOnly.glow, null);
  assert.equal(typographyOnly.paperTexture, 0);
});

test('nib modulation appears only when the face lacks the reference contrast', () => {
  const monolineFace = resolveEffectiveStyle({
    dna: normalizeStyleDna({
      renderHints: { fontCategory: 'sans', weight: 500, strokeContrastRatio: 5.5, penAngleDegrees: 30 },
    }),
    script: 'Latin',
    fidelity: { ...DEFAULT_FIDELITY, textReadability: 0 },
    mode: 'faithful',
    transparent: false,
    preferredFontId: 'inter',
  });
  assert.ok(monolineFace.nibWidthEm > 0.01, 'a monoline face needs broad-nib help');

  const contrastedFace = resolveEffectiveStyle({
    dna: normalizeStyleDna({
      renderHints: { fontCategory: 'display', weight: 400, strokeContrastRatio: 5 },
    }),
    script: 'Latin',
    fidelity: DEFAULT_FIDELITY,
    mode: 'faithful',
    transparent: false,
    preferredFontId: 'abril-fatface',
  });
  assert.ok(contrastedFace.nibWidthEm < 0.02, 'a didone already has the contrast');
});

test('weight stays inside what the chosen face supports', () => {
  for (const preset of STYLE_PRESETS) {
    const style = resolveEffectiveStyle({
      dna: preset.dna,
      script: preset.bestFor[0],
      fidelity: DEFAULT_FIDELITY,
      mode: 'faithful',
      transparent: false,
    });
    assert.ok(
      style.weight >= style.font.weightMin && style.weight <= style.font.weightMax,
      `${preset.id}: weight ${style.weight} outside ${style.font.family} (${style.font.weightMin}–${style.font.weightMax})`,
    );
  }
});

/* ------------------------------------------------------------------ ornament */

test('ornaments scale with the ornamentation level', () => {
  const args = {
    canvas: { width: 1200, height: 1600 },
    textBox: { x: 120, y: 600, width: 960, height: 300 },
    marginRatio: 0.1,
    decorativeElements: 'none',
    fontSize: 180,
  };
  assert.equal(planOrnaments({ ...args, level: 0 }).length, 0);
  const light = planOrnaments({ ...args, level: 0.25 });
  const heavy = planOrnaments({ ...args, level: 0.9 });
  assert.ok(light.length >= 1);
  assert.ok(heavy.length > light.length);
  assert.ok(heavy.some((plan) => plan.kind === 'frame'));

  const forced = planOrnaments({ ...args, level: 0.2, decorativeElements: 'thin inset frame border' });
  assert.ok(forced.some((plan) => plan.kind === 'frame'), 'the analyst can force a frame at a low level');
});

test('tapered outlines are closed, fillable paths', () => {
  const commands = taperedOutline(
    [
      { x: 0, y: 0 },
      { x: 50, y: 10 },
      { x: 100, y: 0 },
    ],
    (t) => 10 * Math.sin(Math.PI * t),
  );
  assert.equal(commands[0].type, 'M');
  assert.equal(commands[commands.length - 1].type, 'Z');
  const svg = pathToSvg(commands);
  assert.match(svg, /^M[\d.-]+ [\d.-]+/);
  assert.match(svg, /Z$/);
  assert.ok(!svg.includes('NaN'));
});

/* -------------------------------------------------------------------- canvas */

test('aspect presets and export scaling behave', () => {
  assert.deepEqual(resolveCanvasSize('1:1'), { width: 1440, height: 1440 });
  assert.deepEqual(resolveCanvasSize('9:16'), { width: 1080, height: 1920 });
  assert.deepEqual(resolveCanvasSize('custom', { width: 900, height: 300 }), {
    width: 900,
    height: 300,
  });
  // Custom sizes are clamped into a range the browser can actually allocate.
  assert.deepEqual(resolveCanvasSize('custom', { width: 10, height: 99999 }), {
    width: 240,
    height: 6000,
  });

  const plain = scaledSize({ width: 1000, height: 1000 }, 2);
  assert.equal(plain.width, 2000);
  assert.equal(plain.capped, false);

  const huge = scaledSize({ width: 6000, height: 6000 }, 4);
  assert.equal(huge.capped, true);
  assert.ok(huge.width <= 12000 && huge.width * huge.height <= 64_000_000);
  assert.match(huge.note, /capped/);

  assert.match(describeOutput({ width: 2480, height: 3508 }, 'a4-portrait'), /DPI/);
  const preview = previewSize({ width: 4000, height: 2000 }, 1500);
  assert.equal(preview.width, 1500);
  assert.equal(preview.height, 750);
});

/* -------------------------------------------------------------------- prompt */

const promptInput = (overrides = {}) => ({
  dna: presetById('gold-wedding-devanagari').dna,
  style: resolveEffectiveStyle({
    dna: presetById('gold-wedding-devanagari').dna,
    script: 'Devanagari',
    fidelity: DEFAULT_FIDELITY,
    mode: 'faithful',
    transparent: false,
  }),
  text: 'शुभ विवाह',
  script: 'Devanagari',
  aspectRatio: '4:5',
  canvas: { width: 1350, height: 1688 },
  transparent: false,
  vectorize: false,
  mode: 'faithful',
  fidelity: DEFAULT_FIDELITY,
  ...overrides,
});

test('the prompt carries the exact text, delimited and unaltered', () => {
  const { prompt, negativePrompt, sections } = buildPrompt(promptInput());
  assert.ok(prompt.includes('<<<शुभ विवाह>>>'), 'the literal string must be delimited');
  assert.ok(prompt.includes('Do not change, misspell, translate'));
  assert.ok(prompt.includes('Devanagari'));
  assert.ok(prompt.includes('#e6c07a'), 'measured colours reach the prompt');
  assert.ok(negativePrompt.includes('broken conjuncts'));
  assert.ok(sections.some((section) => section.title === 'Text fidelity'));
  assert.ok(sections.length >= 7);
});

test('strict mode escalates the fidelity guard', () => {
  const normal = buildPrompt(promptInput()).prompt;
  const strict = buildPrompt(promptInput({ strict: true })).prompt;
  assert.notEqual(normal, strict);
  assert.ok(strict.includes('MAXIMUM STRICTNESS'));
  assert.ok(strict.includes('glyph by glyph'));
});

test('transparency and vector intent change the instructions', () => {
  const transparent = buildPrompt(promptInput({ transparent: true }));
  assert.ok(transparent.prompt.includes('fully transparent alpha'));
  assert.ok(transparent.negativePrompt.includes('opaque background'));

  const vector = buildPrompt(promptInput({ vectorize: true }));
  assert.ok(vector.prompt.includes('Vector intent'));
});

test('multi-line input keeps its line arrangement in the prompt', () => {
  const { prompt } = buildPrompt(promptInput({ text: 'शुभ\nविवाह' }));
  assert.ok(prompt.includes('Line breaks are meaningful'));
  assert.ok(prompt.includes('1. शुभ'));
  assert.ok(prompt.includes('2. विवाह'));
});

/* ------------------------------------------------------------------ fidelity */

test('identical text verifies, drifted text is caught', () => {
  const good = compareTexts('আমি বাংলায় গান গাই', 'আমি বাংলায় গান গাই');
  assert.equal(good.status, 'verified');
  assert.equal(good.similarity, 1);

  const bad = compareTexts('আমি বাংলায় গান গাই', 'আমি বাংলায় গান');
  assert.equal(bad.status, 'mismatch');
  assert.ok(bad.similarity < 0.9);
  assert.match(bad.message, /fidelity issue/);
  assert.ok(bad.detail.includes('Regenerate'));

  const wrongWord = compareTexts('नमस्ते भारत', 'नमस्ते भरत');
  assert.equal(wrongWord.status, 'mismatch');
});

test('normalisation-only differences do not raise a false alarm', () => {
  assert.equal(normalizeForCompare('  नमस्ते   भारत \n'), 'नमस्ते भारत');
  assert.equal(normalizeForCompare('“quoted”'), '"quoted"');
  const zwj = compareTexts('क्षमा', 'क्ष\u200dमा');
  assert.equal(zwj.status, 'verified');
  assert.equal(similarity('Golden Hour', 'Golden  Hour'), 1);
});

test('the vector engine reports structural fidelity', () => {
  const report = guaranteedReport('আমি');
  assert.equal(report.status, 'guaranteed');
  assert.ok(report.message.includes('exact by construction'));
});

/* -------------------------------------------------------------------- presets */

test('every bundled preset is complete and renderable', () => {
  assert.ok(STYLE_PRESETS.length >= 6);
  for (const preset of STYLE_PRESETS) {
    assert.ok(preset.name && preset.blurb);
    assert.ok(preset.swatches.length >= 2);
    assert.ok(preset.sampleText.Latin && preset.sampleText.Bengali && preset.sampleText.Devanagari);
    assert.ok(preset.dna.generationPrompt.length > 40);
    for (const hex of preset.dna.colorProfile.primaryColors) {
      assert.match(hex, /^#[0-9a-f]{6}$/);
    }
    assert.ok(preset.dna.renderHints.weight >= 100);
  }
});
