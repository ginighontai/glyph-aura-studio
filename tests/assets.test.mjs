import test from 'node:test';
import assert from 'node:assert/strict';

// assetUrl reads document.baseURI, so the deployment shapes are simulated by
// swapping that in before importing the module under test.
const withBaseUri = async (baseURI, run) => {
  const previous = globalThis.document;
  globalThis.document = { baseURI };
  try {
    // Fresh import per case: the module reads the base at call time, not load
    // time, so a single import would do — but this keeps the cases independent.
    const { assetUrl, apiUrl } = await import(`../src/lib/assets.ts?case=${encodeURIComponent(baseURI)}`);
    await run({ assetUrl, apiUrl });
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
};

test('served from a domain root', async () => {
  await withBaseUri('http://localhost:8787/', ({ assetUrl, apiUrl }) => {
    assert.equal(assetUrl('/fonts/Inter-Variable.ttf'), 'http://localhost:8787/fonts/Inter-Variable.ttf');
    assert.equal(assetUrl('fonts/Inter-Variable.ttf'), 'http://localhost:8787/fonts/Inter-Variable.ttf');
    assert.equal(apiUrl('/health'), 'http://localhost:8787/api/health');
    assert.equal(apiUrl('analyze'), 'http://localhost:8787/api/analyze');
  });
});

test('served from a sub-path, as GitHub Pages does', async () => {
  await withBaseUri('https://ginighontai.github.io/glyph-aura-studio/', ({ assetUrl, apiUrl }) => {
    // The bug this prevents: a leading slash would escape the sub-path and 404.
    assert.equal(
      assetUrl('/fonts/NotoSerifBengali-Variable.ttf'),
      'https://ginighontai.github.io/glyph-aura-studio/fonts/NotoSerifBengali-Variable.ttf',
    );
    assert.equal(
      apiUrl('/health'),
      'https://ginighontai.github.io/glyph-aura-studio/api/health',
    );
  });
});

test('every bundled font path survives sub-path resolution', async () => {
  await withBaseUri('https://example.test/studio/', async ({ assetUrl }) => {
    const { FONT_LIBRARY } = await import('../src/lib/render/fonts.ts');
    for (const font of FONT_LIBRARY) {
      const resolved = assetUrl(font.file);
      assert.ok(
        resolved.startsWith('https://example.test/studio/fonts/'),
        `${font.id} resolved to ${resolved}`,
      );
      assert.ok(resolved.endsWith('.ttf'));
    }
  });
});

test('falls back sanely with no document (server-side or tests)', async () => {
  const previous = globalThis.document;
  delete globalThis.document;
  try {
    const { assetUrl } = await import('../src/lib/assets.ts?case=nodoc');
    assert.equal(assetUrl('/fonts/x.ttf'), 'http://localhost/fonts/x.ttf');
  } finally {
    if (previous !== undefined) globalThis.document = previous;
  }
});
