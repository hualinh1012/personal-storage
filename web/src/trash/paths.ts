/**
 * Where a deleted file goes in the Deleted folder, and back (issue #24).
 *
 * `Global/photos/a.jpg` → `Deleted/Global/photos/a (deleted 2026-11-10 14-03-12 7f2c).jpg`
 *
 * The original path is kept so a trash manager can see where it came from and
 * Restore can put it back. The stamp makes every deleted copy unique: people
 * without the `trash` flag can write into Deleted/ but not read it, so they
 * couldn't check for a clash. Restore strips the stamp to get the original key.
 */
import { DELETED_PREFIX } from "../config";

const pad = (n: number) => String(n).padStart(2, "0");

/** Local time, so the stamp matches the family's clock. */
function stamp(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

/** Four random lower-case letters or digits, so two deletes in the same second don't clash. */
export function randomTag(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/** Splits `dir/name.ext` into its folder (with trailing slash), base name and extension. */
function splitKey(key: string): { dir: string; base: string; ext: string } {
  const slash = key.lastIndexOf("/");
  const dir = key.slice(0, slash + 1);
  const name = key.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  // A leading dot (".env") is part of the name, not an extension.
  return dot > 0 ? { dir, base: name.slice(0, dot), ext: name.slice(dot) } : { dir, base: name, ext: "" };
}

/** The key a file gets in the Deleted folder. */
export function deletedKey(key: string, now: Date, tag: string): string {
  const { dir, base, ext } = splitKey(key);
  return `${DELETED_PREFIX}${dir}${base} (deleted ${stamp(now)} ${tag})${ext}`;
}

const STAMP = / \(deleted \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2} [0-9a-z]{4}\)$/;

/**
 * The key a file in the Deleted folder had before it was deleted, or null when
 * it isn't one Delete put there (no stamp, or not under Deleted/).
 */
export function originalKey(key: string): string | null {
  if (!key.startsWith(DELETED_PREFIX) || key.endsWith("/")) return null;
  const { dir, base, ext } = splitKey(key.slice(DELETED_PREFIX.length));
  if (!STAMP.test(base)) return null;
  return `${dir}${base.replace(STAMP, "")}${ext}`;
}
