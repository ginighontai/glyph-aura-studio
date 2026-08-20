import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { layoutText } from '../src/lib/render/layout.ts';
import { resolveEffectiveStyle } from '../src/lib/render/params.ts';
import { buildSvg, buildRasterSvgWrapper } from '../src/lib/render/svgRenderer.ts';
import { presetById } from '../src/lib/presets/examples.ts';
import { DEFAULT_FIDELITY } from '../src/types/project.ts';

const measure = (text, fontSize) => text.length * fontSize * 0.52;

function build({
  presetId = 'wet-brush-bengali',
  script = 'Bengali',
  text = 'আমি বাংলায়\nগান গাই',
  mode = 'faithful',
  transparent = false,
  fidelity = DEFAULT_FIDELITY,
  embeddedFont = null,
  width = 1350,
  height = 1688,
} = {}) {
  const preset = presetById(presetId);
  const style = resolveEffectiveStyle({
    dna: preset.dna,
    script,
    fidelity,
    mode,
    transparent,
  });
  const layout = layoutText({
    text,
    width,
    height,
    marginRatio: style.marginRatio,
    lineHeight: style.lineHeight,
    alignment: style.alignment,
    hierarchyContrast: style.hierarchyContrast,
    measure,
  });
  const result = buildSvg({
    text,
    script,
    dna: preset.dna,
    style,
    width,
    height,
    layout,
    fontSize: layout.lines[0].fontSize,
    embeddedFont,
  });
  return { ...result, style, layout, preset };
}

test('the SVG document is structurally sound', () => {
  const { markup } = build();
  assert.ok(markup.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(markup.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(markup.includes('viewBox="0 0 1350 1688"'));
  assert.ok(markup.trimEnd().endsWith('</svg>'));
  assert.ok(!markup.includes('NaN'), 'no NaN may leak into coordinates');
  assert.ok(!markup.includes('undefined'), 'no undefined may leak into attributes');
  // Balanced tags for the elements we generate by hand.
  for (const tag of ['svg', 'defs', 'g', 'text', 'title', 'desc']) {
    const open = markup.match(new RegExp(`<${tag}[\\s>]`, 'g'))?.length ?? 0;
    const close = markup.match(new RegExp(`</${tag}>`, 'g'))?.length ?? 0;
    assert.equal(open, close, `<${tag}> tags must balance (${open} open, ${close} closed)`);
  }
});

test('the user text reaches the SVG complete and in order', () => {
  const text = 'আমি বাংলায়\nগান গাই';
  const { markup, layout, style } = build({ text });

  // The fitter may re-break lines to fill the frame, but not one glyph may be
  // lost, reordered or substituted on the way into the vector file.
  const runs = [...markup.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
  assert.ok(runs.length >= layout.lines.length);

  const nibPasses = runs.length / layout.lines.length;
  assert.ok(Number.isInteger(nibPasses), 'every line gets the same number of passes');

  const unique = runs.filter((_, index) => index % nibPasses === 0);
  assert.equal(unique.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
  assert.ok(markup.includes('aria-label="আমি বাংলায়'), 'the accessible label carries the text');
  assert.equal(style.font.scripts.includes('Bengali'), true);
});

test('XML-hostile characters are escaped, not dropped', () => {
  const { markup } = build({ script: 'Latin', text: 'Ampersand & <angles> "quoted"' });
  assert.ok(markup.includes('Ampersand &amp; &lt;angles&gt; &quot;quoted&quot;'));
  assert.ok(!markup.includes('<angles>'));
});

test('effects become real SVG defs', () => {
  const { markup } = build({ presetId: 'neon-nights', script: 'Latin', text: 'midnight' });
  assert.ok(markup.includes('<filter id="glow"'), 'glow becomes a filter');
  assert.ok(markup.includes('feGaussianBlur'));
  assert.ok(markup.includes('<linearGradient id="inkGradient"'), 'gradient fill becomes a gradient');
  assert.ok(markup.includes('url(#inkGradient)'));

  const gold = build({ presetId: 'gold-wedding-devanagari', script: 'Devanagari', text: 'शुभ विवाह' });
  assert.ok(gold.markup.includes('feDropShadow'), 'shadow becomes feDropShadow');
  assert.ok(gold.markup.includes('<path d="M'), 'ornaments become paths');
});

test('a transparent export omits the background rect', () => {
  const opaque = build();
  const alpha = build({ transparent: true });
  assert.ok(opaque.markup.includes('<rect width="1350" height="1688"'));
  assert.ok(!alpha.markup.includes('<rect width="1350" height="1688"'));
  assert.ok(alpha.approximations.some((note) => note.includes('transparent ground')));
});

test('font embedding is honest either way', () => {
  const without = build();
  assert.ok(without.approximations.some((note) => note.includes('not embedded')));

  const withFont = build({ embeddedFont: 'AAEAAAALAIAAAwAwT1MvMg==' });
  assert.ok(withFont.markup.includes('@font-face'));
  assert.ok(withFont.markup.includes('data:font/ttf;base64,AAEAAAALAIAAAwAwT1MvMg=='));
  assert.ok(!withFont.approximations.some((note) => note.includes('not embedded')));
});

test('the broad-nib sweep is reproduced as repeated text passes', () => {
  const { markup, style } = build({
    presetId: 'wet-brush-bengali',
    fidelity: { ...DEFAULT_FIDELITY, textReadability: 0, styleStrength: 100 },
  });
  const passes = markup.match(/<text /g)?.length ?? 0;
  if (style.nibWidthEm > 0) {
    assert.ok(passes > 2, `expected multiple nib passes, found ${passes}`);
  }
  assert.ok(markup.includes('dominant-baseline="central"'));
});

test('the raster wrapper is honest about what it contains', () => {
  const wrapper = buildRasterSvgWrapper({
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    width: 1024,
    height: 1024,
    label: 'नमस्ते भारत',
  });
  assert.ok(wrapper.markup.includes('<image'));
  assert.ok(wrapper.markup.includes('xlink:href="data:image/png;base64,iVBORw0KGgo="'));
  assert.ok(wrapper.approximations[0].includes('embeds the AI-rendered bitmap'));
  assert.ok(wrapper.approximations[0].includes('path-tracing'));
});

test('writes a sample SVG for external validation', () => {
  // Written to tmp/ (gitignored) so the vector output can be opened in a
  // browser or checked with an external XML parser after a test run.
  mkdirSync(new URL('../tmp/', import.meta.url), { recursive: true });
  for (const [name, options] of [
    ['bengali-brush', {}],
    ['neon-latin', { presetId: 'neon-nights', script: 'Latin', text: 'midnight\ndiner' }],
    ['gold-devanagari', { presetId: 'gold-wedding-devanagari', script: 'Devanagari', text: 'शुभ विवाह' }],
    ['transparent-sticker', { mode: 'transparent-sticker', transparent: true }],
  ]) {
    const { markup } = build(options);
    writeFileSync(new URL(`../tmp/${name}.svg`, import.meta.url), markup, 'utf8');
  }
  assert.ok(true);
});
