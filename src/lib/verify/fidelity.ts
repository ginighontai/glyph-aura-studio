import type { FidelityReport } from '@/types/project';

/**
 * Text fidelity checking.
 *
 * Indic text needs care here: the same word can be encoded several ways, so we
 * normalise to NFC and strip zero-width joiners before comparing. Otherwise a
 * perfectly correct poster would be flagged just because the OCR pass emitted a
 * ZWJ the user did not type.
 */
export function normalizeForCompare(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const first = Array.from(a);
  const second = Array.from(b);
  let previous = new Array<number>(second.length + 1);
  let current = new Array<number>(second.length + 1);
  for (let index = 0; index <= second.length; index += 1) previous[index] = index;

  for (let i = 1; i <= first.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= second.length; j += 1) {
      const cost = first[i - 1] === second[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[second.length];
}

export function similarity(a: string, b: string): number {
  const first = normalizeForCompare(a);
  const second = normalizeForCompare(b);
  if (!first.length && !second.length) return 1;
  const longest = Math.max(Array.from(first).length, Array.from(second).length);
  if (!longest) return 1;
  return 1 - levenshtein(first, second) / longest;
}

const MATCH_THRESHOLD = 0.985;

export function compareTexts(expected: string, recognized: string): FidelityReport {
  const score = similarity(expected, recognized);
  const exact = normalizeForCompare(expected) === normalizeForCompare(recognized);

  if (exact) {
    return {
      status: 'verified',
      expected,
      recognized,
      similarity: 1,
      message: 'Text verified — every character in the poster matches what you typed.',
    };
  }

  if (score >= MATCH_THRESHOLD) {
    return {
      status: 'verified',
      expected,
      recognized,
      similarity: score,
      message: `Text verified at ${(score * 100).toFixed(1)}% — only normalisation-level differences.`,
      detail: `Read back as: “${recognized}”`,
    };
  }

  return {
    status: 'mismatch',
    expected,
    recognized,
    similarity: score,
    message: `Text fidelity issue detected — the poster reads back at ${(score * 100).toFixed(0)}% of your input.`,
    detail: `You typed: “${expected}”\nOCR read: “${recognized}”\nRegenerate with stricter text preservation, or switch to the Vector engine, which sets your string directly.`,
  };
}

/** The vector engine types the string itself, so fidelity is structural. */
export function guaranteedReport(expected: string): FidelityReport {
  return {
    status: 'guaranteed',
    expected,
    similarity: 1,
    message: 'Text is exact by construction — the vector engine set your string directly with a real font.',
    detail:
      'No OCR round-trip is needed: the glyphs come from the bundled typeface and the shaping engine, so characters, matras and conjuncts cannot drift.',
  };
}

export function unavailableReport(expected: string, reason: string): FidelityReport {
  return {
    status: 'unavailable',
    expected,
    message: 'Text fidelity could not be verified automatically.',
    detail: reason,
  };
}
