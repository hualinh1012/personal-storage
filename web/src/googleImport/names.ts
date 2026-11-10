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

/** "photo.jpg" → ["photo", ".jpg"]; "notes" → ["notes", ""]; ".bashrc" → [".bashrc", ""]. */
export function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

/** "photo.jpg", 2 → "photo (2).jpg". */
export function withSuffix(name: string, n: number): string {
  const [stem, ext] = splitExt(name);
  return `${stem} (${n})${ext}`;
}

/** Whether `candidate` is `name` itself or one of its "name (n).ext" siblings. */
export function isSameOrSibling(name: string, candidate: string): boolean {
  if (candidate === name) return true;
  const [stem, ext] = splitExt(name);
  if (!candidate.startsWith(`${stem} (`) || !candidate.endsWith(`)${ext}`)) return false;
  return /^[1-9]\d*$/.test(candidate.slice(stem.length + 2, candidate.length - ext.length - 1));
}
