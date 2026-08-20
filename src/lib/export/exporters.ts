import type { ExportFormat, ExportSettings, GeneratedOutput, ScriptId } from '@/types/project';

export interface ExportArtifact {
  blob: Blob;
  filename: string;
  format: ExportFormat;
  width: number;
  height: number;
  bytes: number;
  notes: string[];
}

const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  svg: 'image/svg+xml',
};

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: Exclude<ExportFormat, 'svg'>,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The browser could not encode this canvas. Try a smaller export scale.'));
      },
      MIME[format],
      quality,
    );
  });
}

export function svgToBlob(markup: string): Blob {
  return new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
}

const slugify = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 42) || 'poster';

export function buildFilename(options: {
  text: string;
  script: ScriptId;
  format: ExportFormat;
  scale: number;
  transparent: boolean;
  width: number;
  height: number;
}): string {
  const parts = [
    'glyphaura',
    slugify(options.text),
    options.script.toLowerCase(),
    `${options.width}x${options.height}`,
  ];
  if (options.scale !== 1 && options.format !== 'svg') parts.push(`${options.scale}x`);
  if (options.transparent) parts.push('alpha');
  return `${parts.join('_')}.${options.format}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next frame so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/** Pixel dimensions an export will land on, for the confirmation copy. */
export function describeExport(output: GeneratedOutput, settings: ExportSettings): string {
  if (settings.format === 'svg') return `${output.width} × ${output.height} vector units`;
  return `${output.width * settings.scale} × ${output.height * settings.scale}px`;
}

export const isTransparentCapable = (format: ExportFormat): boolean => format !== 'jpg';
