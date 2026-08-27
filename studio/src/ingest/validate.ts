/**
 * Upload validation. Runs before any parsing so a bad file produces a clear
 * message rather than a crash or a silent failure.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

export type UploadKind = 'image' | 'pdf' | 'dxf';

export interface UploadCheck {
  ok: boolean;
  kind?: UploadKind;
  error?: string;
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Formats we explicitly cannot read, with an actionable next step. */
const UNSUPPORTED: Record<string, string> = {
  dwg: 'DWG is not supported. Export the drawing as ASCII DXF or PDF and upload that.',
  rvt: 'Revit files are not supported. Export a plan view as PDF and upload that.',
  skp: 'SketchUp files are not supported. Export a plan view as PDF or PNG.',
  dgn: 'MicroStation DGN is not supported. Export as ASCII DXF or PDF.',
  step: 'STEP files are not supported. Upload a site plan as DXF, PDF or an image.',
  ifc: 'IFC is not supported. Export a plan view as PDF and upload that.',
};

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

export function checkUpload(file: File): UploadCheck {
  if (file.size === 0) {
    return { ok: false, error: 'That file is empty. Choose a different file.' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `That file is ${mb} MB. The limit is 20 MB - try exporting at a lower resolution.`,
    };
  }

  const ext = extensionOf(file.name);
  const unsupported = UNSUPPORTED[ext];
  if (unsupported) return { ok: false, error: unsupported };

  if (ext === 'dxf') return { ok: true, kind: 'dxf' };
  if (ext === 'pdf' || file.type === 'application/pdf') return { ok: true, kind: 'pdf' };
  if (IMAGE_TYPES.includes(file.type) || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return { ok: true, kind: 'image' };
  }

  return {
    ok: false,
    error: 'Unsupported file type. Upload a PNG, JPG, WEBP, PDF or ASCII DXF.',
  };
}

export const SUPPORTED_ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.dxf,image/png,image/jpeg,image/webp,application/pdf';

export const SUPPORTED_SUMMARY = 'PNG, JPG, WEBP, PDF or ASCII DXF, up to 20 MB';
