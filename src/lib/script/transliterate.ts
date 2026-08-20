import type { ScriptId } from '@/types/project';
import { BENGALI_LEXICON, DEVANAGARI_LEXICON } from './lexicon';
import { BENGALI_TABLE, DEVANAGARI_TABLE, tokenKeys, type ScriptTable } from './translitTables';

export type PhoneticScript = 'Bengali' | 'Devanagari';

export interface WordTrace {
  source: string;
  output: string;
  via: 'lexicon' | 'rules' | 'passthrough';
}

export interface TransliterationResult {
  output: string;
  words: WordTrace[];
  lexiconHits: number;
  ruleWords: number;
  /** Latin characters the engine could not map — surfaced as a gentle warning. */
  unresolved: string[];
}

interface Engine {
  table: ScriptTable;
  keys: string[];
  lexicon: Record<string, string>;
  consonantGlyphs: Set<string>;
  vowelKeys: Set<string>;
}

function buildEngine(table: ScriptTable, lexicon: Record<string, string>): Engine {
  return {
    table,
    keys: tokenKeys(table),
    lexicon,
    consonantGlyphs: new Set(Object.values(table.consonants)),
    vowelKeys: new Set([...Object.keys(table.independent), ...Object.keys(table.matras)]),
  };
}

const ENGINES: Record<PhoneticScript, Engine> = {
  Bengali: buildEngine(BENGALI_TABLE, BENGALI_LEXICON),
  Devanagari: buildEngine(DEVANAGARI_TABLE, DEVANAGARI_LEXICON),
};

export const supportsPhonetic = (script: ScriptId): script is PhoneticScript =>
  script === 'Bengali' || script === 'Devanagari';

type TokenType = 'consonant' | 'vowel' | 'mark' | 'special' | 'raw';

interface Token {
  key: string;
  type: TokenType;
  glyph: string;
}

/**
 * Typists capitalise the first letter of a word out of habit, and in this scheme
 * capitals mean retroflex consonants — so `Tumi` would come out as টুমি. Title
 * case and SHOUTING are therefore folded down, while deliberate mid-word capitals
 * (`poTol`) are preserved.
 */
export function foldTypingCase(word: string): string {
  if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
    return word.toLowerCase();
  }
  if (/^[A-Z][a-z'’]*$/.test(word)) {
    return word[0].toLowerCase() + word.slice(1);
  }
  return word;
}

function tokenize(engine: Engine, word: string): Token[] {
  const { table, keys } = engine;
  const tokens: Token[] = [];
  let index = 0;

  while (index < word.length) {
    const char = word[index];
    // An apostrophe is an explicit digraph breaker: k'h → ক + হ, never খ.
    if (char === "'" || char === '’') {
      index += 1;
      continue;
    }
    let matched: Token | null = null;
    for (const key of keys) {
      if (!word.startsWith(key, index)) continue;
      if (table.specials[key] !== undefined) {
        matched = { key, type: 'special', glyph: table.specials[key] };
      } else if (table.marks[key] !== undefined) {
        matched = { key, type: 'mark', glyph: table.marks[key] };
      } else if (table.consonants[key] !== undefined) {
        matched = { key, type: 'consonant', glyph: table.consonants[key] };
      } else if (engine.vowelKeys.has(key)) {
        matched = { key, type: 'vowel', glyph: '' };
      }
      if (matched) break;
    }
    if (matched) {
      tokens.push(matched);
      index += matched.key.length;
      continue;
    }
    if (char === '/') {
      tokens.push({ key: '/', type: 'mark', glyph: table.virama });
      index += 1;
      continue;
    }
    tokens.push({ key: char, type: 'raw', glyph: char });
    index += 1;
  }
  return tokens;
}

function transliterateWord(engine: Engine, rawWord: string): WordTrace {
  const folded = foldTypingCase(rawWord);
  const lexical = engine.lexicon[folded.toLowerCase().replace(/['’]/g, '')];
  if (lexical) return { source: rawWord, output: lexical, via: 'lexicon' };

  const tokens = tokenize(engine, folded);
  if (!tokens.some((token) => token.type !== 'raw')) {
    return { source: rawWord, output: rawWord, via: 'passthrough' };
  }

  const { table } = engine;
  let out = '';
  let pendingConsonant = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const next = tokens[i + 1];
    const isLast = i === tokens.length - 1;

    switch (token.type) {
      case 'consonant': {
        const nasal = table.homorganicNasal;
        const isNasalKey = token.key === 'n' || token.key === 'm';
        if (
          nasal &&
          isNasalKey &&
          !pendingConsonant &&
          out.length > 0 &&
          next?.type === 'consonant' &&
          nasal.trigger.has(next.glyph)
        ) {
          out += nasal.mark;
          break;
        }
        if (pendingConsonant && !out.endsWith(table.virama)) out += table.virama;
        out += token.glyph;
        pendingConsonant = true;
        break;
      }
      case 'vowel': {
        if (pendingConsonant) {
          const useFinalO = token.key === 'o' && isLast && table.finalOMatra;
          out += useFinalO ? (table.finalOMatra as string) : (table.matras[token.key] ?? '');
        } else {
          out += table.independent[token.key] ?? '';
        }
        pendingConsonant = false;
        break;
      }
      case 'special': {
        if (pendingConsonant && !out.endsWith(table.virama)) out += table.virama;
        out += token.glyph;
        pendingConsonant = engine.consonantGlyphs.has(token.glyph.slice(-1));
        break;
      }
      case 'mark': {
        out += token.glyph;
        pendingConsonant = token.glyph === table.virama;
        break;
      }
      default: {
        out += token.glyph;
        pendingConsonant = false;
        break;
      }
    }
  }

  return { source: rawWord, output: out, via: 'rules' };
}

function convertPunctuation(table: ScriptTable, run: string): string {
  const keys = Object.keys(table.punctuation).sort((a, b) => b.length - a.length);
  let out = '';
  let index = 0;
  outer: while (index < run.length) {
    for (const key of keys) {
      if (run.startsWith(key, index)) {
        out += table.punctuation[key];
        index += key.length;
        continue outer;
      }
    }
    out += run[index];
    index += 1;
  }
  return out;
}

/**
 * Converts romanised input to the target Indic script while preserving every
 * space, line break and punctuation mark exactly as typed.
 */
export function transliterate(text: string, script: PhoneticScript): TransliterationResult {
  const engine = ENGINES[script];
  const words: WordTrace[] = [];
  const unresolved = new Set<string>();
  let output = '';
  let lexiconHits = 0;
  let ruleWords = 0;

  // `/` (explicit virama) and `~` (nasal mark) belong to the word, not to the
  // punctuation runs, so they travel with the letters they modify.
  const parts = text.split(/([A-Za-z'’/~]+)/);
  for (const part of parts) {
    if (!part) continue;
    if (/^[A-Za-z'’/~]+$/.test(part)) {
      const trace = transliterateWord(engine, part);
      words.push(trace);
      if (trace.via === 'lexicon') lexiconHits += 1;
      else if (trace.via === 'rules') ruleWords += 1;
      else for (const char of part) unresolved.add(char);
      for (const char of trace.output) {
        if (/[A-Za-z]/.test(char)) unresolved.add(char);
      }
      output += trace.output;
    } else {
      output += convertPunctuation(engine.table, part);
    }
  }

  return {
    output,
    words,
    lexiconHits,
    ruleWords,
    unresolved: Array.from(unresolved),
  };
}

/* ------------------------------------------------------------------- guides */

export interface GuideRow {
  roman: string;
  native: string;
  note?: string;
}

export interface GuideSection {
  title: string;
  rows: GuideRow[];
}

export const PHONETIC_GUIDE: Record<PhoneticScript, GuideSection[]> = {
  Bengali: [
    {
      title: 'Vowels',
      rows: [
        { roman: 'a', native: 'আ / া' },
        { roman: 'i', native: 'ই / ি' },
        { roman: 'ii · ee', native: 'ঈ / ী' },
        { roman: 'u', native: 'উ / ু' },
        { roman: 'uu · oo', native: 'ঊ / ূ' },
        { roman: 'e', native: 'এ / ে' },
        { roman: 'oi · ai', native: 'ঐ / ৈ' },
        { roman: 'ou · au', native: 'ঔ / ৌ' },
        { roman: 'o', native: 'ও / ো', note: 'silent inside a word, ও-kar at the end — bhalo → ভালো' },
      ],
    },
    {
      title: 'Consonant pairs',
      rows: [
        { roman: 'k kh g gh', native: 'ক খ গ ঘ' },
        { roman: 'ch chh j jh', native: 'চ ছ জ ঝ' },
        { roman: 't th d dh n', native: 'ত থ দ ধ ন', note: 'dental' },
        { roman: 'T Th D Dh N', native: 'ট ঠ ড ঢ ণ', note: 'capitals = retroflex' },
        { roman: 'p ph b bh m', native: 'প ফ ব ভ ম' },
        { roman: 'sh S s h', native: 'শ ষ স হ' },
        { roman: 'r R l y Y', native: 'র ড় ল য য়' },
      ],
    },
    {
      title: 'Marks & shortcuts',
      rows: [
        { roman: 'ng · M', native: 'ং', note: 'bangla → বাংলা' },
        { roman: '~', native: 'ঁ', note: 'chandrabindu' },
        { roman: 'H', native: 'ঃ' },
        { roman: '/', native: '্', note: 'force a hasanta' },
        { roman: 'kkh · ksh', native: 'ক্ষ' },
        { roman: 'gy · jn', native: 'জ্ঞ' },
        { roman: "k'h", native: 'কহ', note: 'apostrophe splits a digraph' },
        { roman: '|', native: '।', note: 'daṇḍa' },
      ],
    },
  ],
  Devanagari: [
    {
      title: 'Vowels',
      rows: [
        { roman: 'a', native: 'अ', note: 'inherent — namaste → नमस्ते' },
        { roman: 'aa · A', native: 'आ / ा' },
        { roman: 'i', native: 'इ / ि' },
        { roman: 'ii · ee', native: 'ई / ी' },
        { roman: 'u', native: 'उ / ु' },
        { roman: 'uu · oo', native: 'ऊ / ू' },
        { roman: 'e', native: 'ए / े' },
        { roman: 'ai', native: 'ऐ / ै' },
        { roman: 'o', native: 'ओ / ो' },
        { roman: 'au', native: 'औ / ौ' },
        { roman: 'Ri', native: 'ऋ / ृ' },
      ],
    },
    {
      title: 'Consonant pairs',
      rows: [
        { roman: 'k kh g gh', native: 'क ख ग घ' },
        { roman: 'ch chh j jh', native: 'च छ ज झ' },
        { roman: 't th d dh n', native: 'त थ द ध न', note: 'dental' },
        { roman: 'T Th D Dh N', native: 'ट ठ ड ढ ण', note: 'capitals = retroflex' },
        { roman: 'p ph b bh m', native: 'प फ ब भ म' },
        { roman: 'sh S s h', native: 'श ष स ह' },
        { roman: 'y r l v w', native: 'य र ल व व' },
        { roman: 'z f q', native: 'ज़ फ़ क़', note: 'nuqta letters' },
      ],
    },
    {
      title: 'Marks & shortcuts',
      rows: [
        { roman: 'M · ng', native: 'ं', note: 'anusvāra' },
        { roman: '~', native: 'ँ', note: 'candrabindu' },
        { roman: 'H', native: 'ः' },
        { roman: '/', native: '्', note: 'force a halant' },
        { roman: 'ksh · x', native: 'क्ष' },
        { roman: 'gy · jn', native: 'ज्ञ' },
        { roman: 'n + k/g/t/d/p/b', native: 'ं', note: 'mandir → मंदिर' },
        { roman: '|', native: '।', note: 'daṇḍa' },
      ],
    },
  ],
};

/* ------------------------------------------------------------ glyph palettes */

export interface PaletteGroup {
  title: string;
  glyphs: string[];
}

export const NATIVE_PALETTE: Record<PhoneticScript, PaletteGroup[]> = {
  Bengali: [
    { title: 'Vowels', glyphs: ['অ', 'আ', 'ই', 'ঈ', 'উ', 'ঊ', 'ঋ', 'এ', 'ঐ', 'ও', 'ঔ'] },
    { title: 'Kar signs', glyphs: ['া', 'ি', 'ী', 'ু', 'ূ', 'ৃ', 'ে', 'ৈ', 'ো', 'ৌ'] },
    {
      title: 'Consonants',
      glyphs: [
        'ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ',
        'ট', 'ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন',
        'প', 'ফ', 'ব', 'ভ', 'ম', 'য', 'র', 'ল', 'শ', 'ষ',
        'স', 'হ', 'ড়', 'ঢ়', 'য়', 'ৎ',
      ],
    },
    { title: 'Marks', glyphs: ['ং', 'ঁ', 'ঃ', '্', '়', '।', '॥'] },
    { title: 'Conjuncts', glyphs: ['ক্ষ', 'জ্ঞ', 'ন্ত', 'স্ত', 'ম্ব', 'ন্দ', 'ষ্ট', 'ত্র', 'প্র', 'শ্র'] },
  ],
  Devanagari: [
    { title: 'Vowels', glyphs: ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ए', 'ऐ', 'ओ', 'औ'] },
    { title: 'Matras', glyphs: ['ा', 'ि', 'ी', 'ु', 'ू', 'ृ', 'े', 'ै', 'ो', 'ौ'] },
    {
      title: 'Consonants',
      glyphs: [
        'क', 'ख', 'ग', 'घ', 'ङ', 'च', 'छ', 'ज', 'झ', 'ञ',
        'ट', 'ठ', 'ड', 'ढ', 'ण', 'त', 'थ', 'द', 'ध', 'न',
        'प', 'फ', 'ब', 'भ', 'म', 'य', 'र', 'ल', 'व', 'श',
        'ष', 'स', 'ह', 'ज़', 'फ़', 'क़',
      ],
    },
    { title: 'Marks', glyphs: ['ं', 'ँ', 'ः', '्', '़', '।', '॥', 'ॐ'] },
    { title: 'Conjuncts', glyphs: ['क्ष', 'ज्ञ', 'त्र', 'श्र', 'द्व', 'द्य', 'स्त', 'न्द', 'ष्ट', 'प्र'] },
  ],
};
