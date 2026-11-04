export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function isAllowed(
  email: string | undefined,
  emailVerified: string | boolean | undefined,
  allowlist: string[],
): boolean {
  if (!email) return false;
  if (String(emailVerified).toLowerCase() !== "true") return false;
  return allowlist.includes(email.trim().toLowerCase());
}
