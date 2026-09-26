export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/** "text/plain;charset=utf-8" -> "text/plain" */
export function normalizeMimeType(raw: string): string {
  return (raw.split(";")[0] ?? "").trim().toLowerCase();
}

/** Delete path, control characters, and problematic characters in headers / filesystem. */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: to delete control characters
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "_").trim();
  return (cleaned || "file").slice(0, 200);
}