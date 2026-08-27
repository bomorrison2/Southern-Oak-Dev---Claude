/** Raster ingest: read an image file into a data URL and its natural size. */

export interface RasterResult {
  dataUrl: string;
  width: number;
  height: number;
}

export function readImageFile(file: File): Promise<RasterResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image file.'));
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be decoded. Try re-saving it as PNG.'));
      img.onload = () => resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
