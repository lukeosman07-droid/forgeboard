// File uploads: which types are allowed, how big, and how they're shown.
// Shared by the browser and the server. The database checks the same list
// (allowed_upload_type in the files migration), and so does the storage bucket.

export const BUCKET = "attachments";

/** 25 MB per file. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Signed download links last 5 minutes. */
export const SIGNED_URL_SECONDS = 300;

/** Extension -> the one MIME type we store it as. The browser's own guess is ignored. */
export const UPLOAD_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  dwg: "image/vnd.dwg",
  dxf: "image/vnd.dxf",
  txt: "text/plain",
  eml: "message/rfc822",
  vtt: "text/vtt",
  srt: "application/x-subrip",
};

/** For <input accept>. */
export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES).map((ext) => `.${ext}`).join(",");

/** Files the AI can read in the capture panel. */
export const CAPTURE_EXTENSIONS = ["pdf", "docx", "eml", "txt", "vtt", "srt"] as const;
export const CAPTURE_ACCEPT = CAPTURE_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

/** The MIME type to store a file as, or null if that type isn't allowed. */
export function uploadTypeFor(name: string): string | null {
  return UPLOAD_TYPES[extensionOf(name)] ?? null;
}

export function canCapture(name: string): boolean {
  return (CAPTURE_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/**
 * Only images and PDFs open in the browser. Everything else downloads, and no
 * uploaded HTML or SVG is ever shown inline (neither is on the allowed list).
 */
export function opensInBrowser(mime: string): boolean {
  return mime === "application/pdf" || mime === "image/png" || mime === "image/jpeg";
}

export function isImage(mime: string): boolean {
  return mime === "image/png" || mime === "image/jpeg";
}

/** Why a file can't be uploaded, or null if it can. */
export function uploadProblem(file: { name: string; size: number }): string | null {
  if (!uploadTypeFor(file.name)) {
    return `${file.name}: that file type isn't supported. Upload PDF, Word, Excel, images, drawings (DWG, DXF), email (EML) or text and transcripts (TXT, VTT, SRT).`;
  }
  if (file.size <= 0) return `${file.name} is empty.`;
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is ${formatBytes(file.size)}. Files can be up to 25 MB.`;
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** The link that opens an attachment (a fresh 5-minute signed URL each time), at a page for PDFs. */
export function fileHref(attachmentId: string, page?: number | null): string {
  return `/api/files/${attachmentId}${page ? `?page=${page}` : ""}`;
}
