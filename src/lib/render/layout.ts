/**
 * Type layout: pure geometry, no canvas.
 *
 * Width measurement is injected, so the canvas renderer passes a real
 * `ctx.measureText` while tests pass a predictable stub. That keeps the fitting
 * logic — the part that decides whether a poster looks composed or cramped —
 * verifiable without a browser.
 */

export type MeasureFn = (text: string, fontSize: number) => number;

export interface LayoutLine {
  text: string;
  fontSize: number;
  width: number;
  /** Left edge after alignment. */
  x: number;
  /** Vertical centre of the line box; renderers draw with a middle baseline. */
  centerY: number;
  top: number;
  height: number;
  /** Index of the source paragraph, so hierarchy styling can differ per block. */
  paragraph: number;
}

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  lines: LayoutLine[];
  baseFontSize: number;
  box: LayoutBox;
  blockWidth: number;
  blockHeight: number;
  /** True when the text had to be shrunk to the engine's minimum size. */
  clamped: boolean;
  overflow: boolean;
}

export interface LayoutInput {
  text: string;
  width: number;
  height: number;
  marginRatio: number;
  lineHeight: number;
  alignment: 'left' | 'center' | 'right';
  hierarchyContrast: number;
  measure: MeasureFn;
  minFontSize?: number;
  maxFontSize?: number;
}

const MIN_SIZE = 8;

/** Greedy wrap that never splits a word — or an Indic cluster. */
function wrapParagraph(text: string, fontSize: number, maxWidth: number, measure: MeasureFn): string[] {
  const words = text.split(/(\s+)/).filter((token) => token.length > 0);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';

  for (const token of words) {
    if (/^\s+$/.test(token)) {
      if (current) current += token;
      continue;
    }
    const candidate = current ? `${current}${current.endsWith(' ') ? '' : ' '}${token}` : token;
    if (!current || measure(candidate.trimEnd(), fontSize) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current.trimEnd());
      current = token;
    }
  }
  if (current) lines.push(current.trimEnd());
  return lines.length ? lines : [''];
}

interface Attempt {
  lines: Array<{ text: string; fontSize: number; width: number; paragraph: number }>;
  blockHeight: number;
  blockWidth: number;
}

function attempt(
  input: LayoutInput,
  baseSize: number,
  box: LayoutBox,
  allowWrap: boolean,
): Attempt {
  const paragraphs = input.text.replace(/\r\n/g, '\n').split('\n');
  const multi = paragraphs.filter((paragraph) => paragraph.trim().length > 0).length > 1;
  const lines: Attempt['lines'] = [];
  let blockHeight = 0;
  let blockWidth = 0;

  paragraphs.forEach((paragraph, index) => {
    const factor = multi && index > 0 ? input.hierarchyContrast : 1;
    const fontSize = Math.max(MIN_SIZE * 0.5, baseSize * factor);

    if (!paragraph.trim()) {
      // Deliberate blank line: keep it as breathing space.
      blockHeight += fontSize * input.lineHeight * 0.55;
      return;
    }

    const wrapped = allowWrap
      ? wrapParagraph(paragraph.trim(), fontSize, box.width, input.measure)
      : [paragraph.trim()];

    for (const line of wrapped) {
      const width = input.measure(line, fontSize);
      lines.push({ text: line, fontSize, width, paragraph: index });
      blockHeight += fontSize * input.lineHeight;
      blockWidth = Math.max(blockWidth, width);
    }
  });

  return { lines, blockHeight, blockWidth };
}

export function layoutText(input: LayoutInput): LayoutResult {
  const margin = Math.min(0.4, Math.max(0, input.marginRatio));
  const box: LayoutBox = {
    x: input.width * margin,
    y: input.height * margin,
    width: input.width * (1 - margin * 2),
    height: input.height * (1 - margin * 2),
  };

  const minSize = input.minFontSize ?? MIN_SIZE;
  const maxSize = Math.min(input.maxFontSize ?? box.height, box.height);

  const fits = (candidate: Attempt): boolean =>
    candidate.blockHeight <= box.height + 0.5 && candidate.blockWidth <= box.width + 0.5;

  /** Largest size at which the whole block fits, for a given wrapping policy. */
  const solve = (allowWrap: boolean): { best: Attempt; size: number } => {
    let low = minSize;
    let high = Math.max(minSize, maxSize);
    let best = attempt(input, low, box, allowWrap);
    let size = low;

    const largest = attempt(input, high, box, allowWrap);
    if (fits(largest)) return { best: largest, size: high };

    for (let iteration = 0; iteration < 26 && high - low > 0.25; iteration += 1) {
      const middle = (low + high) / 2;
      const candidate = attempt(input, middle, box, allowWrap);
      if (fits(candidate)) {
        best = candidate;
        size = middle;
        low = middle;
      } else {
        high = middle;
      }
    }
    return { best, size };
  };

  // A line break the designer typed is a composition decision, so it is treated
  // as authoritative: only a single unbroken block is re-flowed to fill the
  // frame. If honouring the breaks would collapse the type to the floor, the
  // wrapped solution is used instead of rendering something unreadable.
  const authored = input.text.replace(/\r\n/g, '\n').trim().includes('\n');
  let solution = solve(!authored);
  if (authored && (solution.size <= minSize * 1.35 || !fits(solution.best))) {
    const reflowed = solve(true);
    if (reflowed.size > solution.size) solution = reflowed;
  }

  const best = solution.best;
  const bestSize = solution.size;

  const clamped = bestSize <= minSize + 0.01;
  const overflow = !fits(best);

  // Vertically centre the block inside the margin box.
  let cursor = box.y + Math.max(0, (box.height - best.blockHeight) / 2);
  const lines: LayoutLine[] = best.lines.map((line) => {
    const height = line.fontSize * input.lineHeight;
    const top = cursor;
    cursor += height;
    const x =
      input.alignment === 'left'
        ? box.x
        : input.alignment === 'right'
          ? box.x + box.width - line.width
          : box.x + (box.width - line.width) / 2;
    return {
      ...line,
      x,
      top,
      height,
      centerY: top + height / 2,
    };
  });

  return {
    lines,
    baseFontSize: bestSize,
    box,
    blockWidth: best.blockWidth,
    blockHeight: best.blockHeight,
    clamped,
    overflow,
  };
}

/** Deterministic per-line wobble so hand-set styles do not look mechanical. */
export function baselineOffset(lineIndex: number, jitterEm: number, fontSize: number): number {
  if (jitterEm <= 0) return 0;
  const pseudo = Math.sin((lineIndex + 1) * 12.9898) * 43758.5453;
  const noise = pseudo - Math.floor(pseudo);
  return (noise - 0.5) * 2 * jitterEm * fontSize;
}
