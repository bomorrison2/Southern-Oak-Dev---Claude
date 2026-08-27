/**
 * PDF ingest: render page 1 to a raster the canvas can use as an underlay.
 *
 * pdf.js is imported dynamically so the ~400 kB library is only downloaded when
 * a user actually uploads a PDF. The worker is bundled by Vite, so this works
 * offline with no CDN dependency.
 */

export interface PdfPageResult {
  dataUrl: string;
  width: number;
  height: number;
  pageCount: number;
}

/** Render at 2x for legible line work when zoomed in. */
const RENDER_SCALE = 2;

export async function readPdfFirstPage(file: File): Promise<PdfPageResult> {
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?worker'),
  ]);
  const WorkerCtor = workerModule.default;
  pdfjs.GlobalWorkerOptions.workerPort = new WorkerCtor();

  const buffer = await file.arrayBuffer();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch {
    throw new Error('That PDF could not be opened. It may be password protected or corrupt.');
  }

  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser could not render the PDF.');

    await page.render({ canvasContext: ctx, viewport }).promise;
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      pageCount: doc.numPages,
    };
  } finally {
    void doc.destroy();
  }
}
