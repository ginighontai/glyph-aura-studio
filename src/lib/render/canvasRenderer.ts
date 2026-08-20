import type { ScriptId } from '@/types/project';
import type { StyleDna } from '@/types/styleDna';
import { hexToRgb, luminance, withAlpha } from '../analysis/color';
import {
  addInkSpeckle,
  applyDryBrush,
  applyEmboss,
  blurredCopy,
  canRunPixelEffects,
  createLayer,
  disposeLayer,
  paintGrain,
  paintPaperTexture,
  paintVignette,
  type Layer,
} from './effects';
import { planOrnaments, type PathCommand } from './flourish';
import { ensureFontLoaded } from './fonts';
import { baselineOffset, layoutText, type LayoutResult } from './layout';
import type { EffectiveStyle } from './params';

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

export interface RenderRequest {
  text: string;
  script: ScriptId;
  dna: StyleDna;
  style: EffectiveStyle;
  width: number;
  height: number;
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
  layout: LayoutResult;
  fontSize: number;
  /** Anything the designer should know about how this render was produced. */
  notes: string[];
}

const rad = (degrees: number): number => (degrees * Math.PI) / 180;

function fontShorthand(style: EffectiveStyle, size: number): string {
  return `${style.weight} ${size}px "${style.font.family}", sans-serif`;
}

function applyLetterSpacing(ctx: Ctx, style: EffectiveStyle, size: number): number {
  const spacingPx = style.letterSpacingEm * size;
  if (Math.abs(spacingPx) < 0.01) {
    if (typeof ctx.letterSpacing === 'string') ctx.letterSpacing = '0px';
    return 0;
  }
  if (typeof ctx.letterSpacing === 'string') {
    ctx.letterSpacing = `${spacingPx.toFixed(2)}px`;
    return spacingPx;
  }
  // No native tracking: skip rather than splitting text into glyphs, which
  // would shatter Bengali and Devanagari clusters.
  return 0;
}

function paintBackground(layer: Layer, style: EffectiveStyle): void {
  const background = style.background;
  if (!background) return;
  const { ctx, width, height } = layer;
  const colors = background.colors.length ? background.colors : ['#f5f5f7'];

  if (background.kind === 'linear' && colors.length > 1) {
    const angle = rad(background.angleDegrees);
    const half = Math.hypot(width, height) / 2;
    const cx = width / 2;
    const cy = height / 2;
    const gradient = ctx.createLinearGradient(
      cx - Math.cos(angle) * half,
      cy - Math.sin(angle) * half,
      cx + Math.cos(angle) * half,
      cy + Math.sin(angle) * half,
    );
    colors.slice(0, 4).forEach((color, index, list) => {
      gradient.addColorStop(list.length === 1 ? 0 : index / (list.length - 1), color);
    });
    ctx.fillStyle = gradient;
  } else if ((background.kind === 'radial' || background.kind === 'vignette') && colors.length > 1) {
    const gradient = ctx.createRadialGradient(
      width / 2,
      height * 0.45,
      Math.min(width, height) * 0.05,
      width / 2,
      height * 0.45,
      Math.hypot(width, height) * 0.6,
    );
    const ordered = background.kind === 'radial' ? colors : [...colors].reverse();
    ordered.slice(0, 4).forEach((color, index, list) => {
      gradient.addColorStop(list.length === 1 ? 0 : index / (list.length - 1), color);
    });
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = colors[0];
  }
  ctx.fillRect(0, 0, width, height);

  paintPaperTexture(layer, style.paperTexture, {
    dark: luminance(hexToRgb(colors[0])) < 110,
  });

  if (background.kind === 'vignette') {
    paintVignette(layer, 0.35 + style.paperTexture * 0.2, withAlpha(colors[colors.length - 1], 0.85));
  }
}

function fillPaths(ctx: Ctx, commands: PathCommand[]): void {
  ctx.beginPath();
  for (const command of commands) {
    if (command.type === 'M') ctx.moveTo(command.x, command.y);
    else if (command.type === 'L') ctx.lineTo(command.x, command.y);
    else ctx.closePath();
  }
  ctx.fill();
}

/** Draws every glyph pass of the poster into an opaque mask layer. */
function drawTextMask(
  layer: Layer,
  request: RenderRequest,
  layout: LayoutResult,
  options: { outlineWidthPx?: number } = {},
): void {
  const { style } = request;
  const ctx = layer.ctx as Ctx;
  ctx.clearRect(0, 0, layer.width, layer.height);
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  layout.lines.forEach((line, index) => {
    const size = line.fontSize;
    ctx.font = fontShorthand(style, size);
    applyLetterSpacing(ctx, style, size);

    const jitter = baselineOffset(index, style.baselineJitterEm, size);
    const nibWidth = style.nibWidthEm * size;
    const steps = nibWidth > 0.6 ? Math.min(26, Math.max(2, Math.round(nibWidth))) : 0;
    const penAngle = rad(style.penAngleDegrees);

    ctx.save();
    ctx.translate(line.x, line.centerY + jitter);
    if (Math.abs(style.slantDegrees) > 0.2) {
      ctx.transform(1, 0, -Math.tan(rad(style.slantDegrees)), 1, 0, 0);
    }

    if (options.outlineWidthPx && options.outlineWidthPx > 0.1) {
      ctx.lineWidth = options.outlineWidthPx;
      ctx.strokeText(line.text, 0, 0);
    }

    if (steps > 0) {
      // Broad-nib simulation: sweep the outline along the pen edge so strokes
      // thicken perpendicular to it and stay thin along it.
      for (let step = 0; step <= steps; step += 1) {
        const t = (step / steps - 0.5) * nibWidth;
        ctx.fillText(line.text, Math.cos(penAngle) * t, Math.sin(penAngle) * t);
      }
    } else {
      ctx.fillText(line.text, 0, 0);
    }
    ctx.restore();
  });
}

function tintLayer(source: Layer, color: string, alpha = 1): Layer {
  const out = createLayer(source.width, source.height);
  out.ctx.drawImage(source.canvas, 0, 0);
  out.ctx.globalCompositeOperation = 'source-in';
  out.ctx.fillStyle = color;
  out.ctx.globalAlpha = alpha;
  out.ctx.fillRect(0, 0, out.width, out.height);
  return out;
}

function paintInk(mask: Layer, style: EffectiveStyle, layout: LayoutResult): Layer {
  const ink = createLayer(mask.width, mask.height);
  ink.ctx.drawImage(mask.canvas, 0, 0);
  ink.ctx.globalCompositeOperation = 'source-in';

  const gradient = style.gradient;
  if (gradient) {
    const box = layout.box;
    if (gradient.kind === 'radial') {
      const radial = ink.ctx.createRadialGradient(
        box.x + box.width / 2,
        box.y + box.height / 2,
        Math.min(box.width, box.height) * 0.05,
        box.x + box.width / 2,
        box.y + box.height / 2,
        Math.max(box.width, box.height) * 0.7,
      );
      for (const stop of gradient.stops) radial.addColorStop(stop.offset, stop.color);
      ink.ctx.fillStyle = radial;
    } else {
      const angle = rad(gradient.angleDegrees);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const reach = Math.hypot(box.width, box.height) / 2;
      const linear = ink.ctx.createLinearGradient(
        cx - Math.cos(angle) * reach,
        cy - Math.sin(angle) * reach,
        cx + Math.cos(angle) * reach,
        cy + Math.sin(angle) * reach,
      );
      for (const stop of gradient.stops) linear.addColorStop(stop.offset, stop.color);
      ink.ctx.fillStyle = linear;
    }
  } else {
    ink.ctx.fillStyle = style.inkColors[0];
  }
  ink.ctx.fillRect(0, 0, ink.width, ink.height);
  ink.ctx.globalCompositeOperation = 'source-over';
  return ink;
}

/**
 * Renders the poster.
 *
 * The pipeline is layered exactly the way a lettering artist would work:
 * ground, ornament, shadow, ink bleed, outline, the ink itself, then the
 * surface treatments that sit over everything.
 */
export async function renderPoster(request: RenderRequest): Promise<RenderResult> {
  const { style, width, height } = request;
  const notes: string[] = [];

  const fontReady = await ensureFontLoaded(style.font, style.weight);
  if (!fontReady) {
    notes.push(
      `${style.font.family} did not finish loading, so the browser substituted a fallback face. Re-run Generate once the font has cached.`,
    );
  }

  const text = style.uppercase ? request.text.toLocaleUpperCase() : request.text;

  /* ------------------------------------------------------------------ layout */
  const scratch = createLayer(8, 8);
  const scratchCtx = scratch.ctx as Ctx;
  const measure = (value: string, size: number): number => {
    scratchCtx.font = fontShorthand(style, size);
    const spacing = applyLetterSpacing(scratchCtx, style, size);
    const measured = scratchCtx.measureText(value).width;
    // Native tracking appends a trailing gap; drop it so centring stays true.
    return Math.max(0, measured - (value.length > 0 ? spacing : 0));
  };

  const layout = layoutText({
    text,
    width,
    height,
    marginRatio: style.marginRatio,
    lineHeight: style.lineHeight,
    alignment: style.alignment,
    hierarchyContrast: style.hierarchyContrast,
    measure,
    maxFontSize: height * 0.9,
  });

  if (layout.clamped || layout.overflow) {
    notes.push(
      'The text hit the engine minimum size for this canvas. Shorten a line, add a line break, or pick a taller aspect ratio.',
    );
  }

  const emSize = layout.lines[0]?.fontSize ?? layout.baseFontSize;

  /* -------------------------------------------------------------- background */
  const base = createLayer(width, height);
  paintBackground(base, style);

  /* ---------------------------------------------------------------- ornament */
  const ornaments = planOrnaments({
    level: style.ornamentation,
    canvas: { width, height },
    textBox: {
      x: layout.box.x,
      y: layout.lines.length ? layout.lines[0].top : layout.box.y,
      width: layout.box.width,
      height: layout.blockHeight,
    },
    marginRatio: style.marginRatio,
    decorativeElements: request.dna.compositionProfile.decorativeElements,
    fontSize: emSize,
  });

  const ornamentColor = style.inkColors[1] ?? style.inkColors[0];
  for (const plan of ornaments) {
    base.ctx.save();
    base.ctx.globalAlpha = plan.opacity * (0.55 + style.ornamentation * 0.45);
    base.ctx.fillStyle = ornamentColor;
    fillPaths(base.ctx as Ctx, plan.commands);
    base.ctx.restore();
  }

  /* ------------------------------------------------------------------- glyphs */
  const mask = createLayer(width, height);
  drawTextMask(mask, { ...request, text }, layout);

  if (style.edgeRoughness > 0.01) {
    if (canRunPixelEffects(width, height)) {
      applyDryBrush(mask, style.edgeRoughness, {
        penAngleDegrees: style.penAngleDegrees,
        emSize,
      });
    } else {
      notes.push('Dry-brush erosion was skipped at this export size to stay within browser memory limits.');
    }
  }

  /* --------------------------------------------------------- shadow and glow */
  if (style.shadow && style.shadow.offsetEm + style.shadow.blurEm > 0.002) {
    const offset = style.shadow.offsetEm * emSize;
    const angle = rad(style.shadow.angleDegrees);
    const blurred = blurredCopy(mask, style.shadow.blurEm * emSize);
    const tinted = tintLayer(blurred, style.shadow.color);
    base.ctx.save();
    base.ctx.globalAlpha = 0.85;
    base.ctx.drawImage(tinted.canvas, Math.cos(angle) * offset, Math.sin(angle) * offset);
    base.ctx.restore();
    disposeLayer(blurred);
    disposeLayer(tinted);
  }

  if (style.glow) {
    const radius = style.glow.radiusEm * emSize;
    const tinted = tintLayer(blurredCopy(mask, radius), style.glow.color);
    base.ctx.save();
    base.ctx.globalCompositeOperation = 'lighter';
    for (const pass of [0.55, 0.35]) {
      base.ctx.globalAlpha = pass;
      base.ctx.drawImage(tinted.canvas, 0, 0);
    }
    base.ctx.restore();
    disposeLayer(tinted);
  }

  /* --------------------------------------------------------------- ink bleed */
  if (style.inkBleed > 0.02) {
    const spread = blurredCopy(mask, style.inkBleed * emSize * 0.06 + 1.2);
    const tinted = tintLayer(spread, style.inkColors[0]);
    base.ctx.save();
    base.ctx.globalAlpha = Math.min(0.75, style.inkBleed * 0.85);
    base.ctx.drawImage(tinted.canvas, 0, 0);
    base.ctx.restore();
    disposeLayer(spread);
    disposeLayer(tinted);
  }

  /* ----------------------------------------------------------------- outline */
  if (style.outline) {
    const outlineMask = createLayer(width, height);
    drawTextMask(outlineMask, { ...request, text }, layout, {
      outlineWidthPx: style.outline.widthEm * emSize * 2,
    });
    const tinted = tintLayer(outlineMask, style.outline.color);
    base.ctx.drawImage(tinted.canvas, 0, 0);
    disposeLayer(outlineMask);
    disposeLayer(tinted);
  }

  /* --------------------------------------------------------------------- ink */
  const ink = paintInk(mask, style, layout);
  if (style.embossStrength > 0.02) {
    applyEmboss(ink, style.embossStrength, -45);
  }
  base.ctx.drawImage(ink.canvas, 0, 0);

  // Ink spatter belongs near the strokes, not scattered over the whole sheet, so
  // the speckle layer is masked by a blurred copy of the glyphs.
  if (style.inkBleed > 0.25 || style.edgeRoughness > 0.35) {
    const amount = Math.max(style.inkBleed, style.edgeRoughness);
    const speckle = createLayer(width, height);
    addInkSpeckle(speckle, amount * 0.6, style.inkColors[0], { emSize });
    const halo = blurredCopy(mask, emSize * 0.16 + 2);
    speckle.ctx.globalCompositeOperation = 'destination-in';
    speckle.ctx.drawImage(halo.canvas, 0, 0);
    base.ctx.save();
    base.ctx.globalAlpha = Math.min(0.8, 0.35 + amount * 0.45);
    base.ctx.drawImage(speckle.canvas, 0, 0);
    base.ctx.restore();
    disposeLayer(halo);
    disposeLayer(speckle);
  }

  disposeLayer(ink);
  disposeLayer(mask);
  disposeLayer(scratch);

  /* ------------------------------------------------------------ surface pass */
  if (style.background) {
    paintGrain(base, style.grain);
  }

  return { canvas: base.canvas, layout, fontSize: emSize, notes };
}
