/**
 * Google Drive names → S3 object names. Google allows almost anything in a
 * name; here `/` and `\` would create folders or confuse S3 tools, and control
 * characters break S3's XML listings, so those become `_`. Surrounding
 * whitespace is dropped (Google names can have it, and it's invisible in the
 * drive list).
 */
export function sanitiseName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[/\\\u0000-\u001f\u007f]/g, "_").trim();
  if (cleaned === "") return "untitled";
  if (cleaned === "." || cleaned === "..") return cleaned.replace(/\./g, "_");
  return cleaned;
}
