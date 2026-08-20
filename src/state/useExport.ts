import { useCallback, useState } from 'react';
import { flattenOnto, removeBackground } from '@/lib/export/background';
import {
  buildFilename,
  canvasToBlob,
  downloadBlob,
  formatBytes,
  svgToBlob,
} from '@/lib/export/exporters';
import { scaledSize } from '@/lib/render/aspect';
import { renderPoster } from '@/lib/render/canvasRenderer';
import { fontAsBase64 } from '@/lib/render/fonts';
import { resolveEffectiveStyle } from '@/lib/render/params';
import { buildRasterSvgWrapper, buildSvg } from '@/lib/render/svgRenderer';
import type { ExportFormat } from '@/types/project';
import { artifacts } from './artifacts';
import { useNotify } from './hooks';
import { scaleLayout } from './useGeneration';
import { useStudio } from './store';

const PREVIEW_EDGE = 1400;

export function useExport() {
  const { state } = useStudio();
  const notify = useNotify();
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const run = useCallback(
    async (formatOverride?: ExportFormat) => {
      const output = state.output;
      const context = artifacts.context;
      if (!output || !context) {
        notify({
          tone: 'warning',
          title: 'Nothing to export yet',
          message: 'Generate a poster first, then choose a format here.',
          code: 'EXPORT_FAILED',
        });
        return;
      }

      const settings = { ...state.exportSettings, format: formatOverride ?? state.exportSettings.format };
      const transparent = settings.transparent || settings.typographyOnly || context.transparent;
      setBusy(settings.format);

      try {
        const target = scaledSize(
          { width: context.baseWidth, height: context.baseHeight },
          settings.format === 'svg' ? 1 : settings.scale,
        );
        const notes: string[] = [];
        if (target.note) notes.push(target.note);

        let blob: Blob;

        if (output.kind === 'vector') {
          const style = resolveEffectiveStyle({
            dna: context.dna,
            script: context.script,
            fidelity: context.fidelity,
            mode: context.mode,
            transparent,
            preferredFontId: context.fontOverride ?? undefined,
            typographyOnly: settings.typographyOnly,
            preserveEffects: settings.preserveEffects,
          });

          if (settings.format === 'svg') {
            // Lay the text out once at a workable size, then scale the geometry
            // up to the full output box: vector units, no raster cost.
            const factor = Math.min(
              1,
              PREVIEW_EDGE / Math.max(context.baseWidth, context.baseHeight),
            );
            const measured = await renderPoster({
              text: context.text,
              script: context.script,
              dna: context.dna,
              style,
              width: Math.round(context.baseWidth * factor),
              height: Math.round(context.baseHeight * factor),
            });
            const embedded = settings.embedFontInSvg ? await fontAsBase64(style.font) : null;
            const built = buildSvg({
              text: context.text,
              script: context.script,
              dna: context.dna,
              style,
              width: context.baseWidth,
              height: context.baseHeight,
              layout: scaleLayout(measured.layout, 1 / factor),
              fontSize: measured.fontSize / factor,
              embeddedFont: embedded,
            });
            blob = svgToBlob(built.markup);
            notes.push(...built.approximations);
          } else {
            // A true re-render at export resolution — never an upscale.
            const rendered = await renderPoster({
              text: context.text,
              script: context.script,
              dna: context.dna,
              style,
              width: target.width,
              height: target.height,
            });
            notes.push(...rendered.notes);
            const source =
              settings.format === 'jpg'
                ? flattenOnto(rendered.canvas, style.background?.colors[0] ?? '#ffffff')
                : rendered.canvas;
            blob = await canvasToBlob(
              source,
              settings.format,
              settings.format === 'jpg' ? settings.jpgQuality : undefined,
            );
            if (settings.format === 'jpg' && transparent) {
              notes.push('JPG has no alpha channel, so the transparent ground was flattened.');
            }
          }
        } else {
          const raster = artifacts.raster;
          if (!raster) throw new Error('The generated image is no longer in memory. Regenerate it.');

          if (settings.format === 'svg') {
            const canvas = document.createElement('canvas');
            canvas.width = raster.naturalWidth;
            canvas.height = raster.naturalHeight;
            canvas.getContext('2d')?.drawImage(raster, 0, 0);
            const wrapper = buildRasterSvgWrapper({
              dataUrl: canvas.toDataURL('image/png'),
              width: raster.naturalWidth,
              height: raster.naturalHeight,
              label: context.text.replace(/\n/g, ' '),
            });
            blob = svgToBlob(wrapper.markup);
            notes.push(...wrapper.approximations);
          } else {
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(raster.naturalWidth * settings.scale);
            canvas.height = Math.round(raster.naturalHeight * settings.scale);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(raster, 0, 0, canvas.width, canvas.height);
            if (settings.scale > 1) {
              notes.push(
                `The AI engine renders at a fixed size, so ${settings.scale}× is an interpolated upscale. The Vector engine re-draws at any resolution.`,
              );
            }

            let source = canvas;
            if (transparent && !output.transparent) {
              const cut = removeBackground(canvas, { preserveEffects: settings.preserveEffects });
              source = cut.canvas;
              notes.push(`Background keyed out (${Math.round(cut.removedRatio * 100)}% of pixels).`);
            }
            if (settings.format === 'jpg') {
              source = flattenOnto(source, '#ffffff');
              if (transparent) notes.push('JPG has no alpha channel, so the artwork was flattened onto white.');
            }
            blob = await canvasToBlob(
              source,
              settings.format,
              settings.format === 'jpg' ? settings.jpgQuality : undefined,
            );
          }
        }

        const filename = buildFilename({
          text: context.text,
          script: context.script,
          format: settings.format,
          scale: settings.scale,
          transparent,
          width: settings.format === 'svg' ? context.baseWidth : target.width,
          height: settings.format === 'svg' ? context.baseHeight : target.height,
        });
        downloadBlob(blob, filename);

        notify({
          tone: 'success',
          title: `${settings.format.toUpperCase()} exported`,
          message: [`${filename} · ${formatBytes(blob.size)}`, ...notes].join('\n'),
          ttl: 7000,
        });
      } catch (error) {
        notify({
          tone: 'error',
          title: 'Export failed',
          message:
            error instanceof Error
              ? error.message
              : 'The browser could not encode the file. Try a smaller scale.',
          code: 'EXPORT_FAILED',
        });
      } finally {
        setBusy(null);
      }
    },
    [notify, state.exportSettings, state.output],
  );

  return { run, busy };
}
