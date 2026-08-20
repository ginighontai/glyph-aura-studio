/**
 * Romanisation tables for the built-in phonetic keyboards.
 *
 * The scheme is a pragmatic blend of the conventions Bengali and Hindi typists
 * already know (Avro / ITRANS style) tuned for the way people actually type on
 * a laptop: digraphs for aspirates, capitals for retroflex, and a small set of
 * punctuation escapes. It is documented for the user in the Phonetic guide
 * sheet so nothing is guesswork.
 */

export interface ScriptTable {
  /** Consonant letters. */
  consonants: Record<string, string>;
  /** Independent (word-initial) vowel letters. */
  independent: Record<string, string>;
  /** Dependent vowel signs. An empty string means the inherent vowel. */
  matras: Record<string, string>;
  /** Sequences emitted verbatim, bypassing cluster logic. */
  specials: Record<string, string>;
  /** Marks that attach to the previous cluster. */
  marks: Record<string, string>;
  virama: string;
  /**
   * Bengali only: a word-final bare `o` is written with the ও-kar rather than
   * being treated as the inherent vowel, so `bhalo` becomes ভালো.
   */
  finalOMatra?: string;
  /** When set, `n`/`m` before one of these consonants becomes anusvara. */
  homorganicNasal?: { trigger: Set<string>; mark: string };
  punctuation: Record<string, string>;
}

const SHARED_MARKS_BENGALI = {
  M: 'ং',
  ng: 'ং',
  '~': 'ঁ',
  H: 'ঃ',
};

export const BENGALI_TABLE: ScriptTable = {
  consonants: {
    k: 'ক',
    kh: 'খ',
    g: 'গ',
    gh: 'ঘ',
    NG: 'ঙ',
    Ng: 'ঙ',
    c: 'চ',
    ch: 'চ',
    chh: 'ছ',
    Ch: 'ছ',
    j: 'জ',
    jh: 'ঝ',
    ny: 'ঞ',
    NY: 'ঞ',
    T: 'ট',
    Th: 'ঠ',
    D: 'ড',
    Dh: 'ঢ',
    N: 'ণ',
    t: 'ত',
    th: 'থ',
    d: 'দ',
    dh: 'ধ',
    n: 'ন',
    p: 'প',
    ph: 'ফ',
    f: 'ফ',
    b: 'ব',
    bh: 'ভ',
    v: 'ভ',
    m: 'ম',
    z: 'জ',
    y: 'য',
    Y: 'য়',
    r: 'র',
    R: 'ড়',
    Rh: 'ঢ়',
    l: 'ল',
    sh: 'শ',
    S: 'ষ',
    Sh: 'ষ',
    s: 'স',
    h: 'হ',
  },
  independent: {
    a: 'আ',
    aa: 'আ',
    A: 'আ',
    i: 'ই',
    ii: 'ঈ',
    I: 'ঈ',
    ee: 'ঈ',
    u: 'উ',
    uu: 'ঊ',
    U: 'ঊ',
    oo: 'ঊ',
    rri: 'ঋ',
    e: 'এ',
    oi: 'ঐ',
    ai: 'ঐ',
    o: 'ও',
    O: 'ও',
    ou: 'ঔ',
    au: 'ঔ',
  },
  matras: {
    a: 'া',
    aa: 'া',
    A: 'া',
    i: 'ি',
    ii: 'ী',
    I: 'ী',
    ee: 'ী',
    u: 'ু',
    uu: 'ূ',
    U: 'ূ',
    oo: 'ূ',
    rri: 'ৃ',
    e: 'ে',
    oi: 'ৈ',
    ai: 'ৈ',
    o: '',
    O: 'ো',
    ou: 'ৌ',
    au: 'ৌ',
  },
  specials: {
    kkh: 'ক্ষ',
    ksh: 'ক্ষ',
    kSh: 'ক্ষ',
    gy: 'জ্ঞ',
    jn: 'জ্ঞ',
    w: 'ওয়',
    q: 'ক',
    x: 'ক্স',
  },
  marks: SHARED_MARKS_BENGALI,
  virama: '্',
  finalOMatra: 'ো',
  punctuation: { '|': '।', '||': '॥' },
};

export const DEVANAGARI_TABLE: ScriptTable = {
  consonants: {
    k: 'क',
    kh: 'ख',
    g: 'ग',
    gh: 'घ',
    NG: 'ङ',
    Ng: 'ङ',
    c: 'च',
    ch: 'च',
    chh: 'छ',
    Ch: 'छ',
    j: 'ज',
    jh: 'झ',
    ny: 'ञ',
    NY: 'ञ',
    T: 'ट',
    Th: 'ठ',
    D: 'ड',
    Dh: 'ढ',
    N: 'ण',
    t: 'त',
    th: 'थ',
    d: 'द',
    dh: 'ध',
    n: 'न',
    p: 'प',
    ph: 'फ',
    f: 'फ़',
    b: 'ब',
    bh: 'भ',
    v: 'व',
    w: 'व',
    m: 'म',
    y: 'य',
    r: 'र',
    l: 'ल',
    L: 'ळ',
    sh: 'श',
    S: 'ष',
    Sh: 'ष',
    s: 'स',
    h: 'ह',
    z: 'ज़',
    q: 'क़',
    G: 'ग़',
    K: 'ख़',
  },
  independent: {
    a: 'अ',
    aa: 'आ',
    A: 'आ',
    i: 'इ',
    ii: 'ई',
    I: 'ई',
    ee: 'ई',
    u: 'उ',
    uu: 'ऊ',
    U: 'ऊ',
    oo: 'ऊ',
    Ri: 'ऋ',
    rri: 'ऋ',
    e: 'ए',
    ai: 'ऐ',
    oi: 'ऐ',
    o: 'ओ',
    O: 'ओ',
    au: 'औ',
    ou: 'औ',
  },
  matras: {
    a: '',
    aa: 'ा',
    A: 'ा',
    i: 'ि',
    ii: 'ी',
    I: 'ी',
    ee: 'ी',
    u: 'ु',
    uu: 'ू',
    U: 'ू',
    oo: 'ू',
    Ri: 'ृ',
    rri: 'ृ',
    e: 'े',
    ai: 'ै',
    oi: 'ै',
    o: 'ो',
    O: 'ो',
    au: 'ौ',
    ou: 'ौ',
  },
  specials: {
    ksh: 'क्ष',
    kSh: 'क्ष',
    x: 'क्ष',
    gy: 'ज्ञ',
    jn: 'ज्ञ',
    shr: 'श्र',
    tr: 'त्र',
  },
  marks: {
    M: 'ं',
    ng: 'ं',
    '~': 'ँ',
    H: 'ः',
  },
  virama: '्',
  homorganicNasal: {
    trigger: new Set(['क', 'ख', 'ग', 'घ', 'च', 'छ', 'ज', 'झ', 'ट', 'ठ', 'ड', 'ढ', 'त', 'थ', 'द', 'ध', 'प', 'फ', 'ब', 'भ']),
    mark: 'ं',
  },
  punctuation: { '|': '।', '||': '॥' },
};

/** Longest-first key list so the tokenizer never mis-splits a digraph. */
export function tokenKeys(table: ScriptTable): string[] {
  const keys = new Set<string>([
    ...Object.keys(table.consonants),
    ...Object.keys(table.independent),
    ...Object.keys(table.matras),
    ...Object.keys(table.specials),
    ...Object.keys(table.marks),
  ]);
  return Array.from(keys).sort((a, b) => b.length - a.length || a.localeCompare(b));
}
