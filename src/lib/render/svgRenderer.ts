import type { ScriptId } from '@/types/project';
import type { StyleDna } from '@/types/styleDna';
import { hexToRgb, luminance } from '../analysis/color';
import { pathToSvg, planOrnaments } from './flourish';
import { baselineOffset, type LayoutResult } from './layout';
import type { EffectiveStyle } from './params';

export interface SvgRequest {
  text: string;
  script: ScriptId;
  dna: StyleDna;
  style: EffectiveStyle;
  width: number;
  height: number;
  layout: LayoutResult;
  fontSize: number;
  /** Base64 TTF payload, so the artwork renders identically without the fonts installed. */
  embeddedFont?: string | null;
  title?: string;
}

export interface SvgResult {
  markup: string;
  /** Honest account of what the vector version approximates. */
  approximations: string[];
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const n = (value: number, precision = 2): string => Number(value.toFixed(precision)).toString();
const rad = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Builds a real vector document: live text elements in the bundled face, native
 * SVG gradients, and SVG filters standing in for the raster effect passes.
 *
 * The layout is the one the canvas renderer already computed, so the vector file
 * is the same composition rather than a second, slightly different guess.
 */
export function buildSvg(request: SvgRequest): SvgResult {
  const { style, width, height, layout, fontSize } = request;
  const approximations: string[] = [];
  const defs: string[] = [];
  const body: string[] = [];

  const text = style.uppercase ? request.text.toLocaleUpperCase() : request.text;

  /* ---------------------------------------------------------- embedded font */
  if (request.embeddedFont) {
    defs.push(
      `<style type="text/css"><![CDATA[
@font-face {
  font-family: '${style.font.family}';
  font-weight: ${style.font.variable ? `${style.font.weightMin} ${style.font.weightMax}` : style.font.weightMin};
  src: url(data:font/ttf;base64,${request.embeddedFont}) format('truetype${style.font.variable ? '-variations' : ''}');
}
]]></style>`,
    );
  } else {
    approximations.push(
      `The face “${style.font.family}” is referenced but not embedded — viewers without it will substitute a fallback. Re-export with “Embed font” enabled for a self-contained file.`,
    );
  }

  /* ---------------------------------------------------------------- gradients */
  const inkFill = (() => {
    if (!style.gradient) return style.inkColors[0];
    const id = 'inkGradient';
    if (style.gradient.kind === 'radial') {
      defs.push(
        `<radialGradient id="${id}" cx="50%" cy="50%" r="70%">${style.gradient.stops
          .map((stop) => `<stop offset="${n(stop.offset * 100)}%" stop-color="${stop.color}"/>`)
          .join('')}</radialGradient>`,
      );
    } else {
      const angle = rad(style.gradient.angleDegrees);
      const x1 = 50 - Math.cos(angle) * 50;
      const y1 = 50 - Math.sin(angle) * 50;
      const x2 = 50 + Math.cos(angle) * 50;
      const y2 = 50 + Math.sin(angle) * 50;
      defs.push(
        `<linearGradient id="${id}" x1="${n(x1)}%" y1="${n(y1)}%" x2="${n(x2)}%" y2="${n(y2)}%">${style.gradient.stops
          .map((stop) => `<stop offset="${n(stop.offset * 100)}%" stop-color="${stop.color}"/>`)
          .join('')}</linearGradient>`,
      );
    }
    return `url(#${id})`;
  })();

  /* --------------------------------------------------------------- background */
  if (style.background) {
    const colors = style.background.colors.length ? style.background.colors : ['#f5f5f7'];
    let fill = colors[0];
    if (colors.length > 1 && style.background.kind === 'linear') {
      const angle = rad(style.background.angleDegrees);
      defs.push(
        `<linearGradient id="bgGradient" x1="${n(50 - Math.cos(angle) * 50)}%" y1="${n(
          50 - Math.sin(angle) * 50,
        )}%" x2="${n(50 + Math.cos(angle) * 50)}%" y2="${n(50 + Math.sin(angle) * 50)}%">${colors
          .slice(0, 4)
          .map(
            (color, index, list) =>
              `<stop offset="${n((index / Math.max(1, list.length - 1)) * 100)}%" stop-color="${color}"/>`,
          )
          .join('')}</linearGradient>`,
      );
      fill = 'url(#bgGradient)';
    } else if (colors.length > 1) {
      const ordered = style.background.kind === 'vignette' ? [...colors].reverse() : colors;
      defs.push(
        `<radialGradient id="bgGradient" cx="50%" cy="45%" r="72%">${ordered
          .slice(0, 4)
          .map(
            (color, index, list) =>
              `<stop offset="${n((index / Math.max(1, list.length - 1)) * 100)}%" stop-color="${color}"/>`,
          )
          .join('')}</radialGradient>`,
      );
      fill = 'url(#bgGradient)';
    }
    body.push(`<rect width="${n(width)}" height="${n(height)}" fill="${fill}"/>`);

    if (style.paperTexture > 0.05 || style.grain > 0.05) {
      const level = Math.max(style.paperTexture, style.grain);
      defs.push(
        `<filter id="paperGrain" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="${n(0.9 - level * 0.35, 3)}" numOctaves="4" seed="7" result="noise"/>
  <feColorMatrix in="noise" type="saturate" values="0"/>
  <feComponentTransfer>
    <feFuncA type="linear" slope="${n(0.16 + level * 0.34, 3)}" intercept="0"/>
  </feComponentTransfer>
</filter>`,
      );
      body.push(
        `<rect width="${n(width)}" height="${n(height)}" filter="url(#paperGrain)" style="mix-blend-mode:overlay"/>`,
      );
      approximations.push(
        'Paper tooth and grain are recreated with an SVG turbulence filter rather than the raster noise field, so the texture is similar but not pixel-identical.',
      );
    }
  }

  /* ----------------------------------------------------------------- ornament */
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
    fontSize,
  });
  const ornamentColor = style.inkColors[1] ?? style.inkColors[0];
  for (const plan of ornaments) {
    body.push(
      `<path d="${pathToSvg(plan.commands)}" fill="${ornamentColor}" fill-rule="evenodd" opacity="${n(
        plan.opacity * (0.55 + style.ornamentation * 0.45),
        3,
      )}"/>`,
    );
  }

  /* ------------------------------------------------------------------ filters */
  const textFilters: string[] = [];

  if (style.shadow && style.shadow.offsetEm + style.shadow.blurEm > 0.002) {
    const angle = rad(style.shadow.angleDegrees);
    const distance = style.shadow.offsetEm * fontSize;
    defs.push(
      `<filter id="dropShadow" x="-30%" y="-30%" width="180%" height="180%">
  <feDropShadow dx="${n(Math.cos(angle) * distance)}" dy="${n(Math.sin(angle) * distance)}" stdDeviation="${n(
    (style.shadow.blurEm * fontSize) / 2,
  )}" flood-color="${style.shadow.color}" flood-opacity="0.85"/>
</filter>`,
    );
    textFilters.push('url(#dropShadow)');
  }

  if (style.glow) {
    defs.push(
      `<filter id="glow" x="-45%" y="-45%" width="190%" height="190%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="${n((style.glow.radiusEm * fontSize) / 2)}" result="blur"/>
  <feFlood flood-color="${style.glow.color}" flood-opacity="0.9" result="colour"/>
  <feComposite in="colour" in2="blur" operator="in" result="glow"/>
  <feMerge>
    <feMergeNode in="glow"/>
    <feMergeNode in="glow"/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>`,
    );
    textFilters.push('url(#glow)');
  }

  if (style.edgeRoughness > 0.06 || style.inkBleed > 0.12) {
    const level = Math.max(style.edgeRoughness, style.inkBleed);
    defs.push(
      `<filter id="inkEdges" x="-15%" y="-15%" width="130%" height="130%">
  <feTurbulence type="fractalNoise" baseFrequency="${n(0.035 + level * 0.05, 4)}" numOctaves="3" seed="11" result="turb"/>
  <feDisplacementMap in="SourceGraphic" in2="turb" scale="${n(level * fontSize * 0.045)}" xChannelSelector="R" yChannelSelector="G"/>
</filter>`,
    );
    textFilters.push('url(#inkEdges)');
    approximations.push(
      'Dry-brush break-up is approximated with a displacement filter; the raster export carries the finer speckle and eroded holes.',
    );
  }

  if (style.embossStrength > 0.05) {
    approximations.push('The inner bevel is omitted from the vector file — it is a raster-only pass.');
  }

  /* --------------------------------------------------------------------- text */
  const spacing = style.letterSpacingEm * fontSize;
  const lines = layout.lines
    .map((line, index) => {
      const jitter = baselineOffset(index, style.baselineJitterEm, line.fontSize);
      const nibWidth = style.nibWidthEm * line.fontSize;
      const steps = nibWidth > 0.6 ? Math.min(26, Math.max(2, Math.round(nibWidth))) : 0;
      const penAngle = rad(style.penAngleDegrees);
      const skew = Math.abs(style.slantDegrees) > 0.2 ? ` skewX(${n(-style.slantDegrees)})` : '';
      const common = `font-family="${escapeXml(style.font.family)}" font-size="${n(
        line.fontSize,
      )}" font-weight="${style.weight}" letter-spacing="${n(spacing)}" dominant-baseline="central" xml:space="preserve"`;

      const passes: string[] = [];
      if (style.outline) {
        passes.push(
          `<text ${common} fill="none" stroke="${style.outline.color}" stroke-width="${n(
            style.outline.widthEm * line.fontSize * 2,
          )}" stroke-linejoin="round" paint-order="stroke">${escapeXml(line.text)}</text>`,
        );
      }
      if (steps > 0) {
        for (let step = 0; step <= steps; step += 1) {
          const t = (step / steps - 0.5) * nibWidth;
          passes.push(
            `<text ${common} x="${n(Math.cos(penAngle) * t)}" y="${n(
              Math.sin(penAngle) * t,
            )}" fill="${inkFill}">${escapeXml(line.text)}</text>`,
          );
        }
      } else {
        passes.push(`<text ${common} fill="${inkFill}">${escapeXml(line.text)}</text>`);
      }

      return `<g transform="translate(${n(line.x)} ${n(line.centerY + jitter)})${skew}">
${passes.map((pass) => `    ${pass}`).join('\n')}
  </g>`;
    })
    .join('\n  ');

  body.push(
    `<g${textFilters.length ? ` filter="${textFilters.join(' ')}"` : ''}>
  ${lines}
</g>`,
  );

  if (style.inkColors.length && style.transparent) {
    approximations.push('Exported on a transparent ground — the background layer is intentionally absent.');
  }

  const title = request.title ?? `GlyphAura Studio — ${text.slice(0, 60)}`;
  const contrastNote = luminance(hexToRgb(style.inkColors[0])) > 140 ? 'light ink' : 'dark ink';

  const markup = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}"
     role="img" aria-label="${escapeXml(text)}">
  <title>${escapeXml(title)}</title>
  <desc>${escapeXml(
    `${text} set in ${style.font.family} at weight ${style.weight} (${contrastNote}), generated by GlyphAura Studio from an analysed reference style.`,
  )}</desc>
  <defs>
${defs.map((entry) => `    ${entry}`).join('\n')}
  </defs>
${body.map((entry) => `  ${entry}`).join('\n')}
</svg>
`;

  return { markup, approximations };
}

/** Wraps a raster poster in an SVG shell — used for AI-generated output. */
export function buildRasterSvgWrapper(options: {
  dataUrl: string;
  width: number;
  height: number;
  label: string;
}): SvgResult {
  const { dataUrl, width, height, label } = options;
  const markup = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
     role="img" aria-label="${escapeXml(label)}">
  <title>${escapeXml(label)}</title>
  <desc>Raster poster produced by the AI image engine, wrapped for vector workflows. The artwork itself is a bitmap.</desc>
  <image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" xlink:href="${dataUrl}"/>
</svg>
`;
  return {
    markup,
    approximations: [
      'This SVG embeds the AI-rendered bitmap rather than true outlines. For editable vector paths, generate with the Vector engine — or run the file through a path-tracing step (on the roadmap).',
    ],
  };
}
