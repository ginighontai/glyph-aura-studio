import { useCallback } from 'react';
import { ApiError, base64ToObjectUrl, generateImage, ocrImage } from '@/lib/api/client';
import { removeBackground } from '@/lib/export/background';
import { canvasToBlob } from '@/lib/export/exporters';
import { buildPrompt } from '@/lib/prompt/build';
import { previewSize, resolveCanvasSize } from '@/lib/render/aspect';
import { renderPoster } from '@/lib/render/canvasRenderer';
import { fontAsBase64 } from '@/lib/render/fonts';
import { resolveEffectiveStyle } from '@/lib/render/params';
import { buildRasterSvgWrapper, buildSvg } from '@/lib/render/svgRenderer';
import { compareTexts, guaranteedReport, unavailableReport } from '@/lib/verify/fidelity';
import {
  aspectPreset,
  type GeneratedOutput,
  type StageId,
  type StageState,
} from '@/types/project';
import type { LayoutResult } from '@/lib/render/layout';
import { artifacts } from './artifacts';
import { useNotify } from './hooks';
import { activeScript, generateReadiness, useStudio } from './store';

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const decodeImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The generated image could not be decoded.'));
    image.src = url;
  });

const outputId = (): string => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function useGeneration() {
  const { state, dispatch } = useStudio();
  const notify = useNotify();

  const generate = useCallback(
    async (options: { strict?: boolean } = {}) => {
      const readiness = generateReadiness(state);
      const style = state.analysis.style;
      if (!readiness.ready || !style) {
        if (readiness.reason) {
          notify({
            tone: 'warning',
            title: 'Not ready yet',
            message: readiness.reason,
            code: state.text.trim() ? 'NO_IMAGE' : 'EMPTY_TEXT',
          });
        }
        return;
      }

      const script = activeScript(state);
      const text = state.text.replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
      const base = resolveCanvasSize(state.aspect, state.customSize);
      const preview = previewSize(base);
      const started = Date.now();
      const previousUrl = state.output?.url;

      dispatch({ type: 'generate/start' });

      let current: StageId | null = null;
      const stage = (id: StageId, stageState: StageState, note?: string): void => {
        current = stageState === 'active' ? id : null;
        dispatch({ type: 'stage/set', id, state: stageState, note });
      };

      try {
        /* ------------------------------------------------ 1. read reference */
        stage('read-reference', 'active');
        await nextFrame();
        stage(
          'read-reference',
          'done',
          state.reference ? state.reference.name : state.activePresetId ? 'example style' : 'style loaded',
        );

        /* ---------------------------------------------------- 2. style DNA */
        stage('extract-dna', 'active');
        await nextFrame();
        stage(
          'extract-dna',
          'done',
          style.meta.engine === 'gemini'
            ? `Gemini · ${Math.round((style.dna.confidenceScore ?? 0) * 100)}% confident`
            : style.meta.engine === 'preset'
              ? 'example preset'
              : `local · ${Math.round((style.dna.confidenceScore ?? 0) * 100)}% confident`,
        );

        /* ------------------------------------------------------- 3. prompt */
        stage('build-prompt', 'active');
        await nextFrame();

        const effective = resolveEffectiveStyle({
          dna: style.dna,
          script,
          fidelity: state.fidelity,
          mode: state.mode,
          transparent: state.transparent,
          preferredFontId: state.fontOverride ?? undefined,
        });

        const bundle = buildPrompt({
          dna: style.dna,
          style: effective,
          text,
          script,
          aspectRatio: state.aspect,
          canvas: base,
          transparent: state.transparent,
          vectorize: state.vectorize,
          mode: state.mode,
          fidelity: state.fidelity,
          strict: options.strict,
        });
        dispatch({ type: 'prompt/set', prompt: bundle });
        stage('build-prompt', 'done', `${bundle.prompt.length.toLocaleString()} characters`);

        /* ------------------------------------------------------- 4. render */
        stage('render', 'active');
        await nextFrame();

        let output: GeneratedOutput;
        let notes: string[] = [];
        let svg: { markup: string; approximations: string[] } | null = null;

        if (state.engine === 'vector') {
          const result = await renderPoster({
            text,
            script,
            dna: style.dna,
            style: effective,
            width: preview.width,
            height: preview.height,
          });

          artifacts.poster = result.canvas;
          artifacts.style = effective;
          artifacts.layout = result.layout;
          artifacts.fontSize = result.fontSize;
          artifacts.raster = null;
          artifacts.context = {
            dna: style.dna,
            script,
            text,
            fidelity: state.fidelity,
            mode: state.mode,
            transparent: state.transparent,
            fontOverride: state.fontOverride,
            baseWidth: base.width,
            baseHeight: base.height,
          };

          notes = result.notes;
          const blob = await canvasToBlob(result.canvas, 'png');
          output = {
            id: outputId(),
            kind: 'vector',
            engine: 'vector',
            url: URL.createObjectURL(blob),
            width: base.width,
            height: base.height,
            transparent: state.transparent,
            createdAt: Date.now(),
            aspectRatio: state.aspect,
            text,
            script,
            fontFamily: effective.font.family,
            fontId: effective.font.id,
            prompt: bundle.prompt,
            negativePrompt: bundle.negativePrompt,
            elapsedMs: Date.now() - started,
          };
          stage('render', 'done', `${effective.font.family} · ${Math.round(result.fontSize)}px`);
        } else {
          const promptToSend = state.promptDraft?.trim() ? state.promptDraft : bundle.prompt;
          const response = await generateImage({
            prompt: promptToSend,
            text,
            script,
            aspectRatio: aspectPreset(state.aspect).apiAspect,
            transparent: state.transparent,
            referenceImage: state.reference
              ? { imageBase64: state.reference.base64, mimeType: state.reference.mimeType }
              : null,
          });

          const rawUrl = base64ToObjectUrl(response.image.base64, response.image.mimeType);
          let image = await decodeImage(rawUrl);
          let displayUrl = rawUrl;

          if (state.transparent) {
            const flat = document.createElement('canvas');
            flat.width = image.naturalWidth;
            flat.height = image.naturalHeight;
            const context = flat.getContext('2d');
            if (context) {
              context.drawImage(image, 0, 0);
              const cut = removeBackground(flat, {
                preserveEffects: state.exportSettings.preserveEffects,
              });
              const blob = await canvasToBlob(cut.canvas, 'png');
              URL.revokeObjectURL(rawUrl);
              displayUrl = URL.createObjectURL(blob);
              image = await decodeImage(displayUrl);
              notes.push(
                `Background keyed out from the AI render (${Math.round(cut.removedRatio * 100)}% of pixels cleared).`,
              );
            }
          }

          artifacts.raster = image;
          artifacts.poster = null;
          artifacts.style = effective;
          artifacts.context = {
            dna: style.dna,
            script,
            text,
            fidelity: state.fidelity,
            mode: state.mode,
            transparent: state.transparent,
            fontOverride: state.fontOverride,
            baseWidth: image.naturalWidth,
            baseHeight: image.naturalHeight,
          };

          if (response.note) notes.push(response.note);

          output = {
            id: outputId(),
            kind: 'raster',
            engine: 'ai-image',
            url: displayUrl,
            width: image.naturalWidth,
            height: image.naturalHeight,
            transparent: state.transparent,
            createdAt: Date.now(),
            aspectRatio: state.aspect,
            text,
            script,
            prompt: promptToSend,
            negativePrompt: bundle.negativePrompt,
            note: response.note,
            modelUsed: response.meta.model,
            elapsedMs: Date.now() - started,
          };
          stage('render', 'done', `${response.meta.model} · ${(response.meta.elapsedMs / 1000).toFixed(1)}s`);
        }

        /* ------------------------------------------------------- 5. verify */
        stage('verify', 'active');
        await nextFrame();

        if (state.engine === 'vector') {
          dispatch({ type: 'fidelityReport/set', report: guaranteedReport(text) });
          stage('verify', 'done', 'exact by construction');
        } else if (state.capabilities?.ocrVerification && artifacts.raster) {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = artifacts.raster.naturalWidth;
            canvas.height = artifacts.raster.naturalHeight;
            canvas.getContext('2d')?.drawImage(artifacts.raster, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            const response = await ocrImage({
              imageBase64: dataUrl.slice(dataUrl.indexOf(',') + 1),
              mimeType: 'image/png',
              expectedText: text,
            });
            const report = compareTexts(text, response.text);
            dispatch({ type: 'fidelityReport/set', report });
            stage(
              'verify',
              report.status === 'mismatch' ? 'failed' : 'done',
              `${Math.round((report.similarity ?? 0) * 100)}% match`,
            );
            if (report.status === 'mismatch') {
              notify({
                tone: 'error',
                title: 'Text fidelity issue detected',
                message: report.message,
                code: 'TEXT_MISMATCH',
                actionLabel: 'Regenerate strictly',
                action: () => void generate({ strict: true }),
              });
            }
          } catch (error) {
            const reason = error instanceof ApiError ? error.message : 'The OCR pass failed.';
            dispatch({ type: 'fidelityReport/set', report: unavailableReport(text, reason) });
            stage('verify', 'skipped', 'OCR unavailable');
          }
        } else {
          dispatch({
            type: 'fidelityReport/set',
            report: unavailableReport(
              text,
              'OCR verification needs a Gemini API key on the server. Compare the poster against your text by eye, or use the Vector engine for guaranteed characters.',
            ),
          });
          stage('verify', 'skipped', 'no OCR configured');
        }

        /* ------------------------------------------------ 6. prepare export */
        stage('prepare-export', 'active');
        await nextFrame();

        if (state.engine === 'vector' && artifacts.layout && artifacts.style) {
          const embedded = state.exportSettings.embedFontInSvg
            ? await fontAsBase64(artifacts.style.font)
            : null;
          // The SVG is built at full output size from the same layout, scaled up
          // from the preview render so the vector file is print-resolution.
          const scale = base.width / preview.width;
          svg = buildSvg({
            text,
            script,
            dna: style.dna,
            style: artifacts.style,
            width: base.width,
            height: base.height,
            layout: scaleLayout(artifacts.layout, scale),
            fontSize: artifacts.fontSize * scale,
            embeddedFont: embedded,
            title: `GlyphAura Studio — ${text.replace(/\n/g, ' ').slice(0, 60)}`,
          });
        } else if (output.kind === 'raster') {
          const canvas = document.createElement('canvas');
          canvas.width = output.width;
          canvas.height = output.height;
          if (artifacts.raster) canvas.getContext('2d')?.drawImage(artifacts.raster, 0, 0);
          svg = buildRasterSvgWrapper({
            dataUrl: canvas.toDataURL('image/png'),
            width: output.width,
            height: output.height,
            label: text.replace(/\n/g, ' '),
          });
        }

        stage('prepare-export', 'done', svg ? 'raster + vector ready' : 'raster ready');

        if (previousUrl) URL.revokeObjectURL(previousUrl);
        dispatch({ type: 'generate/success', output, notes, svg });

        notify({
          tone: 'success',
          title: 'Poster ready',
          message:
            state.engine === 'vector'
              ? `Set in ${output.fontFamily} at ${output.width} × ${output.height}. Export up to 4× from the Export panel.`
              : `Rendered by ${output.modelUsed ?? 'the image model'}. Check the fidelity report before exporting.`,
          ttl: 5200,
        });
      } catch (error) {
        dispatch({ type: 'generate/fail' });
        if (current) dispatch({ type: 'stage/set', id: current, state: 'failed' });
        notify({
          tone: 'error',
          title: 'Generation failed',
          message:
            error instanceof ApiError
              ? error.message
              : error instanceof Error
                ? error.message
                : 'Something went wrong while rendering the poster.',
          code: 'GENERATION_FAILED',
          actionLabel: 'Try again',
          action: () => void generate(options),
        });
      }
    },
    [dispatch, notify, state],
  );

  return { generate };
}

/** Scales a layout computed at preview size up to the final output size. */
export function scaleLayout(layout: LayoutResult, scale: number): LayoutResult {
  if (scale === 1) return layout;
  return {
    ...layout,
    lines: layout.lines.map((line) => ({
      ...line,
      x: line.x * scale,
      centerY: line.centerY * scale,
      top: line.top * scale,
      height: line.height * scale,
      width: line.width * scale,
      fontSize: line.fontSize * scale,
    })),
    box: {
      x: layout.box.x * scale,
      y: layout.box.y * scale,
      width: layout.box.width * scale,
      height: layout.box.height * scale,
    },
    blockWidth: layout.blockWidth * scale,
    blockHeight: layout.blockHeight * scale,
    baseFontSize: layout.baseFontSize * scale,
  };
}
