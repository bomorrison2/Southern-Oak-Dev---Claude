/** File exports that work without any server: JSON, and PNG from a canvas. */
import type { Project } from '@/domain/types';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name: string): string {
  const cleaned = name.trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-');
  return cleaned.length > 0 ? cleaned.toLowerCase() : 'archform-project';
}

export function exportProjectJson(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  triggerDownload(blob, `${safeFileName(project.meta.name)}.json`);
}

export function exportCanvasPng(canvas: HTMLCanvasElement, name: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    triggerDownload(blob, `${safeFileName(name)}.png`);
  }, 'image/png');
}
