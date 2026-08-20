import type { ScriptId } from '@/types/project';
import type { DetectedScript } from '@/types/styleDna';

export interface ScriptBreakdown {
  latin: number;
  bengali: number;
  devanagari: number;
  other: number;
  total: number;
}

export interface ScriptDetection {
  dominant: DetectedScript;
  breakdown: ScriptBreakdown;
  /** Share of letters belonging to the dominant script, 0–1. */
  confidence: number;
  scripts: ScriptId[];
}

const isLatin = (code: number): boolean =>
  (code >= 0x41 && code <= 0x5a) ||
  (code >= 0x61 && code <= 0x7a) ||
  (code >= 0xc0 && code <= 0x24f);

const isBengali = (code: number): boolean => code >= 0x0980 && code <= 0x09ff;

const isDevanagari = (code: number): boolean =>
  (code >= 0x0900 && code <= 0x097f) || (code >= 0xa8e0 && code <= 0xa8ff);

/** True for marks and joiners that should not sway the vote on their own. */
const isCombining = (code: number): boolean =>
  code === 0x200c || code === 0x200d || (code >= 0x0300 && code <= 0x036f);

export function detectScript(text: string): ScriptDetection {
  const breakdown: ScriptBreakdown = { latin: 0, bengali: 0, devanagari: 0, other: 0, total: 0 };

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || isCombining(code)) continue;
    if (/[\p{P}\p{S}\p{N}]/u.test(char)) continue;
    breakdown.total += 1;
    if (isLatin(code)) breakdown.latin += 1;
    else if (isBengali(code)) breakdown.bengali += 1;
    else if (isDevanagari(code)) breakdown.devanagari += 1;
    else breakdown.other += 1;
  }

  if (breakdown.total === 0) {
    return { dominant: 'Unknown', breakdown, confidence: 0, scripts: [] };
  }

  const entries: Array<[ScriptId, number]> = [
    ['Latin', breakdown.latin],
    ['Bengali', breakdown.bengali],
    ['Devanagari', breakdown.devanagari],
  ];
  entries.sort((a, b) => b[1] - a[1]);

  const significant = entries.filter(([, count]) => count / breakdown.total >= 0.15);
  const [topScript, topCount] = entries[0];
  const confidence = topCount / breakdown.total;

  return {
    dominant: significant.length > 1 ? 'Mixed' : topCount === 0 ? 'Unknown' : topScript,
    breakdown,
    confidence,
    scripts: significant.map(([script]) => script),
  };
}

export const SCRIPT_LABELS: Record<DetectedScript, string> = {
  Latin: 'Latin / English',
  Bengali: 'Bengali · বাংলা',
  Devanagari: 'Devanagari · देवनागरी',
  Mixed: 'Mixed scripts',
  Unknown: 'Not detected',
};

/** Does the text contain at least one character of the target script? */
export function containsScript(text: string, script: ScriptId): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (script === 'Latin' && isLatin(code)) return true;
    if (script === 'Bengali' && isBengali(code)) return true;
    if (script === 'Devanagari' && isDevanagari(code)) return true;
  }
  return false;
}

/** Latin letters that look like un-converted phonetic input inside Indic text. */
export function strayLatinRuns(text: string): string[] {
  const matches = text.match(/[A-Za-z]{2,}/g);
  return matches ? Array.from(new Set(matches)) : [];
}
