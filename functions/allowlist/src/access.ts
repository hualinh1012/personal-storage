/**
 * Per-person access levels (issue #15). The SSM parameter /family-drive/access
 * holds JSON keyed by email:
 *
 *   { "a@x.com": { "global": "write", "personal": true }, "b@x.com": { "global": "read" } }
 *
 * `global` is required. Other flags are booleans and default to false.
 * Terraform validates the same rules before deploying (infra/foundation_inputs.tf).
 */
export type GlobalAccess = "read" | "write";

export interface Access {
  global: GlobalAccess;
  personal: boolean;
}

export type AccessMap = Map<string, Access>;

/** An allowlisted email with no entry: read-only Global/, no personal folder. */
export const DEFAULT_ACCESS: Access = { global: "read", personal: false };

const FLAGS = ["personal"] as const;
const KNOWN_KEYS = new Set<string>(["global", ...FLAGS]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parses the JSON into a map keyed by lower-cased, trimmed email. Throws on
 * anything malformed, including the same email twice in different case
 * (JSON.parse alone would silently keep the last one). Undefined or empty
 * input is an empty map: everyone gets the default.
 */
export function parseAccess(raw: string | undefined): AccessMap {
  const map: AccessMap = new Map();
  if (raw === undefined || raw.trim() === "") return map;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("access levels are not valid JSON");
  }
  if (!isPlainObject(parsed)) throw new Error("access levels must be a JSON object keyed by email");

  for (const [rawEmail, entry] of Object.entries(parsed)) {
    const email = rawEmail.trim().toLowerCase();
    if (!email) throw new Error("access levels contain an empty email");
    if (map.has(email)) throw new Error(`access levels list ${email} more than once`);
    if (!isPlainObject(entry)) throw new Error(`access for ${email} must be an object`);

    for (const key of Object.keys(entry)) {
      if (!KNOWN_KEYS.has(key)) throw new Error(`access for ${email} has unknown key "${key}"`);
    }
    if (entry.global !== "read" && entry.global !== "write") {
      throw new Error(`access for ${email} needs "global": "read" or "write"`);
    }
    for (const flag of FLAGS) {
      if (entry[flag] !== undefined && typeof entry[flag] !== "boolean") {
        throw new Error(`access for ${email}: "${flag}" must be true or false`);
      }
    }
    map.set(email, { global: entry.global, personal: entry.personal === true });
  }
  return map;
}

export function accessFor(email: string, map: AccessMap): Access {
  return map.get(email.trim().toLowerCase()) ?? DEFAULT_ACCESS;
}

/**
 * ID-token claims for the access level. Claim values (and the principal tags
 * the Identity Pool maps them to) are strings, so booleans become "yes"/"no".
 */
export function accessClaims(access: Access): Record<string, string> {
  return { global_access: access.global, personal: access.personal ? "yes" : "no" };
}
