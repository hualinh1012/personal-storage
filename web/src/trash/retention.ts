/**
 * The Deleted folder's retention (issue #25): S3 removes files there this many
 * days after they were deleted (lifecycle rule in infra/foundation/files.tf).
 * The number reaches config.json from the same Terraform variable, so the
 * note never disagrees with the rule.
 */

/** Whole days from config.json, or null when it's missing or not a positive whole number. */
export function parseRetentionDays(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\s*\d+\s*$/.test(raw)) return null;
  const days = Number(raw);
  return Number.isSafeInteger(days) && days >= 1 ? days : null;
}

/** The note shown in the Deleted folder, or null when the retention isn't known. */
export function retentionNote(days: number | null): string | null {
  if (days === null) return null;
  return `Files here are removed for good ${days} ${days === 1 ? "day" : "days"} after they were deleted.`;
}
