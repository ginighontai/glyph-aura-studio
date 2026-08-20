/**
 * Ornament geometry — pure path generation shared by the canvas and SVG
 * renderers, so a swash exported to vector is the same swash you previewed.
 *
 * Everything is emitted as closed, fillable outlines (including strokes, which
 * are built as tapered polygons) because that is what survives vector export
 * without depending on stroke attributes.
 */

export interface Point {
  x: number;
  y: number;
}

export type PathCommand =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'Z' };

export interface OrnamentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pathToSvg(commands: PathCommand[], precision = 2): string {
  const n = (value: number): string => value.toFixed(precision);
  return commands
    .map((command) => {
      switch (command.type) {
        case 'M':
          return `M${n(command.x)} ${n(command.y)}`;
        case 'L':
          return `L${n(command.x)} ${n(command.y)}`;
        default:
          return 'Z';
      }
    })
    .join(' ');
}

export function cubicPoints(p0: Point, p1: Point, p2: Point, p3: Point, steps = 48): Point[] {
  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const mt = 1 - t;
    points.push({
      x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
      y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return points;
}

/**
 * Converts a polyline into a closed outline whose width varies along its
 * length — the calligraphic taper that makes a swash look drawn rather than
 * stroked.
 */
export function taperedOutline(points: Point[], widthAt: (t: number) => number): PathCommand[] {
  if (points.length < 2) return [];
  const left: Point[] = [];
  const right: Point[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const half = Math.max(0.05, widthAt(index / (points.length - 1)) / 2);
    left.push({ x: points[index].x + nx * half, y: points[index].y + ny * half });
    right.push({ x: points[index].x - nx * half, y: points[index].y - ny * half });
  }

  const commands: PathCommand[] = [{ type: 'M', x: left[0].x, y: left[0].y }];
  for (let index = 1; index < left.length; index += 1) {
    commands.push({ type: 'L', x: left[index].x, y: left[index].y });
  }
  for (let index = right.length - 1; index >= 0; index -= 1) {
    commands.push({ type: 'L', x: right[index].x, y: right[index].y });
  }
  commands.push({ type: 'Z' });
  return commands;
}

const taper = (peak: number, sharpness = 1.6): ((t: number) => number) => (t: number) =>
  peak * Math.sin(Math.PI * t) ** sharpness;

/** Long calligraphic S-swash, typically tucked under a headline. */
export function swashFlourish(box: OrnamentBox, weight: number, mirrored = false): PathCommand[] {
  const { x, y, width } = box;
  const amplitude = box.height * 0.55;
  const direction = mirrored ? -1 : 1;
  const points = cubicPoints(
    { x, y: y + amplitude * 0.2 * direction },
    { x: x + width * 0.28, y: y - amplitude * direction },
    { x: x + width * 0.72, y: y + amplitude * direction },
    { x: x + width, y: y - amplitude * 0.2 * direction },
    64,
  );
  return taperedOutline(points, taper(weight, 1.3));
}

/** A pair of hairlines with a lozenge in the middle — classic poster furniture. */
export function ruleWithDiamond(box: OrnamentBox, weight: number): PathCommand[] {
  const commands: PathCommand[] = [];
  const { x, y, width } = box;
  const gap = Math.max(weight * 2.2, box.height * 0.3);
  const diamond = Math.max(weight * 3.4, box.height * 0.5);
  const segment = (width - diamond * 2.6) / 2;

  for (const offset of [-gap / 2, gap / 2]) {
    for (const start of [x, x + width - segment]) {
      commands.push(
        { type: 'M', x: start, y: y + offset - weight / 2 },
        { type: 'L', x: start + segment, y: y + offset - weight / 2 },
        { type: 'L', x: start + segment, y: y + offset + weight / 2 },
        { type: 'L', x: start, y: y + offset + weight / 2 },
        { type: 'Z' },
      );
    }
  }

  const cx = x + width / 2;
  commands.push(
    { type: 'M', x: cx, y: y - diamond / 2 },
    { type: 'L', x: cx + diamond / 2.6, y },
    { type: 'L', x: cx, y: y + diamond / 2 },
    { type: 'L', x: cx - diamond / 2.6, y },
    { type: 'Z' },
  );
  return commands;
}

/** Four corner brackets that frame the composition without boxing it in. */
export function cornerBrackets(box: OrnamentBox, weight: number): PathCommand[] {
  const arm = Math.min(box.width, box.height) * 0.16;
  const commands: PathCommand[] = [];
  const corners: Array<[number, number, number, number]> = [
    [box.x, box.y, 1, 1],
    [box.x + box.width, box.y, -1, 1],
    [box.x, box.y + box.height, 1, -1],
    [box.x + box.width, box.y + box.height, -1, -1],
  ];

  for (const [cx, cy, sx, sy] of corners) {
    commands.push(
      { type: 'M', x: cx, y: cy },
      { type: 'L', x: cx + arm * sx, y: cy },
      { type: 'L', x: cx + arm * sx, y: cy + weight * sy },
      { type: 'L', x: cx + weight * sx, y: cy + weight * sy },
      { type: 'L', x: cx + weight * sx, y: cy + arm * sy },
      { type: 'L', x: cx, y: cy + arm * sy },
      { type: 'Z' },
    );
  }
  return commands;
}

/** Inset frame drawn as a closed ring so it fills cleanly. */
export function insetFrame(box: OrnamentBox, weight: number): PathCommand[] {
  const outer: PathCommand[] = [
    { type: 'M', x: box.x, y: box.y },
    { type: 'L', x: box.x + box.width, y: box.y },
    { type: 'L', x: box.x + box.width, y: box.y + box.height },
    { type: 'L', x: box.x, y: box.y + box.height },
    { type: 'Z' },
  ];
  const inner: PathCommand[] = [
    { type: 'M', x: box.x + weight, y: box.y + weight },
    { type: 'L', x: box.x + weight, y: box.y + box.height - weight },
    { type: 'L', x: box.x + box.width - weight, y: box.y + box.height - weight },
    { type: 'L', x: box.x + box.width - weight, y: box.y + weight },
    { type: 'Z' },
  ];
  return [...outer, ...inner];
}

export type OrnamentKind = 'rule' | 'swash' | 'corners' | 'frame';

export interface OrnamentPlan {
  kind: OrnamentKind;
  commands: PathCommand[];
  /** 0–1 opacity suggestion so heavy ornament can sit behind the type. */
  opacity: number;
}

/**
 * Decides which ornaments a poster gets from the ornamentation level and any
 * decorative elements the analyst actually saw in the reference.
 */
export function planOrnaments(input: {
  level: number;
  canvas: { width: number; height: number };
  textBox: OrnamentBox;
  marginRatio: number;
  decorativeElements: string;
  fontSize: number;
}): OrnamentPlan[] {
  const { level, canvas, textBox, fontSize } = input;
  if (level <= 0.06) return [];

  const hints = input.decorativeElements.toLowerCase();
  const wantsFrame = /frame|border|box|panel/.test(hints);
  const wantsRule = /rule|line|divider|underline|bar/.test(hints);
  const wantsSwash = /swash|flourish|ornament|scroll|curl|vine/.test(hints);

  const plans: OrnamentPlan[] = [];
  const weight = Math.max(1.2, fontSize * 0.035 * (0.6 + level));
  const inset = Math.min(canvas.width, canvas.height) * Math.max(0.035, input.marginRatio * 0.55);

  if (wantsFrame || level > 0.74) {
    plans.push({
      kind: 'frame',
      commands: insetFrame(
        {
          x: inset,
          y: inset,
          width: canvas.width - inset * 2,
          height: canvas.height - inset * 2,
        },
        Math.max(1.5, weight * 0.7),
      ),
      opacity: 0.75,
    });
  }

  if (wantsRule || level > 0.16) {
    const gap = fontSize * 0.55;
    plans.push({
      kind: 'rule',
      commands: ruleWithDiamond(
        {
          x: textBox.x + textBox.width * 0.16,
          y: textBox.y + textBox.height + gap,
          width: textBox.width * 0.68,
          height: fontSize * 0.22,
        },
        Math.max(1.1, weight * 0.4),
      ),
      opacity: 0.9,
    });
  }

  if (wantsSwash || level > 0.36) {
    const gap = fontSize * (level > 0.16 ? 1.15 : 0.6);
    plans.push({
      kind: 'swash',
      commands: swashFlourish(
        {
          x: textBox.x + textBox.width * 0.08,
          y: textBox.y + textBox.height + gap,
          width: textBox.width * 0.84,
          height: fontSize * 0.42 * (0.6 + level),
        },
        Math.max(1.4, weight * 0.85),
      ),
      opacity: 0.95,
    });
  }

  if (level > 0.56) {
    plans.push({
      kind: 'corners',
      commands: cornerBrackets(
        {
          x: inset * 1.4,
          y: inset * 1.4,
          width: canvas.width - inset * 2.8,
          height: canvas.height - inset * 2.8,
        },
        Math.max(2, weight * 0.9),
      ),
      opacity: 0.7,
    });
  }

  return plans;
}
