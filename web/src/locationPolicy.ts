/**
 * Location policy (issue #38): who can do what where, in one place.
 *
 * The browser mirrors IAM's rule (infra/identity.tf, the `authenticated`
 * policy) only to hide what IAM would refuse. Display only: the session tags
 * stay the security boundary (ADR 0010). Every web caller that asks "can this
 * person write / move / manage Deleted here?" reads it from this module.
 *
 * Location kinds (GLOSSARY.md):
 * - `shared`: the shared drive, `Global/`. Everyone reads; `globalWrite` writes.
 * - `personal`: the signed-in person's own folder, `Personal/<email>/`, keyed
 *   by lower-cased email (ADR 0009); only with the `personal` flag.
 * - `deleted`: the Deleted folder, `Deleted/` (ADR 0011); only with `trash`.
 * - `other`: anything else, including someone else's personal folder: nothing.
 */
import type { Access } from "./access";

/** The shared drive: everyone signed in can read it; writing depends on their access level. */
export const DRIVE_PREFIX = "Global/";
/** Personal folders live at `Personal/<email>/`; IAM allows only the caller's own (ADR 0009). */
export const PERSONAL_PREFIX = "Personal/";
/** The Deleted folder (issue #24, ADR 0011). Delete in the app moves files here, under their original path. */
export const DELETED_PREFIX = "Deleted/";

export type LocationKind = "shared" | "personal" | "deleted" | "other";

/** What the signed-in person can do in a location. */
export interface Capabilities {
  /** List and download. */
  read: boolean;
  /** Upload, create folders, copy into, import from Google Drive, edit text files. */
  write: boolean;
  /** Move files away and Delete (which moves them to Deleted/): needs write and delete. */
  move: boolean;
  /** Restore, Delete permanently and Empty Deleted: only in the Deleted folder. */
  manageDeleted: boolean;
}

type Permission = "delete" | "get" | "list" | "write";

export interface LocationPolicy extends Capabilities {
  kind: LocationKind;
  /** Storage Browser permissions, which its own actions and our actions' `hide` read. */
  permissions: Permission[];
}

/**
 * The signed-in person's folder prefix. Lower-cased because IAM compares it,
 * case-sensitively, with the raw `email` claim, and Google sends emails in
 * lower case. An email with capitals in its claim would get AccessDenied.
 */
export function personalPrefix(email: string): string {
  return `${PERSONAL_PREFIX}${email.trim().toLowerCase()}/`;
}

/** Which kind of location a prefix or key is in, for this person. */
export function locationKind(prefixOrKey: string, email: string): LocationKind {
  if (prefixOrKey.startsWith(DRIVE_PREFIX)) return "shared";
  if (prefixOrKey.startsWith(DELETED_PREFIX)) return "deleted";
  if (email.trim() && prefixOrKey.startsWith(personalPrefix(email))) return "personal";
  return "other";
}

const NOTHING: Capabilities = { read: false, write: false, move: false, manageDeleted: false };

function capabilitiesFor(kind: LocationKind, access: Access): Capabilities {
  switch (kind) {
    case "shared": // ListDriveFolder, ReadDriveObjects; WriteDriveObjects with global_access = write
      return { read: true, write: access.globalWrite, move: access.globalWrite, manageDeleted: false };
    case "personal": // ListOwnPersonalFolder, ManageOwnPersonalObjects with personal = yes
      return access.personal ? { read: true, write: true, move: true, manageDeleted: false } : NOTHING;
    case "deleted": // ListDeletedFolder, ManageDeletedObjects with trash = yes; no PutObject to list or read back
      return access.trash ? { read: true, write: false, move: false, manageDeleted: true } : NOTHING;
    case "other":
      return NOTHING;
  }
}

/**
 * Storage Browser's own actions follow these: Upload, Create folder and Copy
 * need "write", Delete needs "delete". "delete" without "write" marks the
 * Deleted folder, which `capabilitiesOf` reads back.
 */
function toPermissions(c: Capabilities): Permission[] {
  const p: Permission[] = [];
  if (c.move || c.manageDeleted) p.push("delete");
  if (c.read) p.push("get", "list");
  if (c.write) p.push("write");
  return p;
}

/** What the person can do at a location prefix (or at a single key). */
export function locationPolicy(access: Access, email: string, prefixOrKey: string): LocationPolicy {
  const kind = locationKind(prefixOrKey, email);
  const capabilities = capabilitiesFor(kind, access);
  return { kind, ...capabilities, permissions: toPermissions(capabilities) };
}

/**
 * Reads capabilities back from a location's Storage Browser permissions. An
 * action's `hide` gets only the permissions, not the prefix, so this decodes
 * what `toPermissions` encoded; the tests check the round trip for every kind.
 */
export function capabilitiesOf(permissions: readonly string[]): Capabilities {
  const has = (p: Permission) => permissions.includes(p);
  return {
    read: has("get") && has("list"),
    write: has("write"),
    move: has("write") && has("delete"),
    manageDeleted: has("delete") && !has("write"),
  };
}

/** An action's `hide`: hidden unless the location allows `capability`. */
export const hideUnless =
  (capability: keyof Capabilities) =>
  (permissions: readonly string[]): boolean =>
    !capabilitiesOf(permissions)[capability];

/** Whether Restore (or anything else) may write the file at `key` for this person. */
export function canWriteAt(access: Access, email: string) {
  return (key: string) => locationPolicy(access, email, key).write;
}

function storageLocation(bucket: string, prefix: string, policy: LocationPolicy) {
  return { bucket, prefix, type: "PREFIX" as const, permissions: [...policy.permissions] };
}

/** Storage Browser location for the shared drive, so it opens there instead of a location picker. */
export function driveLocation(bucket: string, access: Access) {
  return storageLocation(bucket, DRIVE_PREFIX, locationPolicy(access, "", DRIVE_PREFIX));
}

/** The locations on Home, in order: the shared drive, the person's own folder, the Deleted folder. */
function homeLocations(email: string, access: Access) {
  const candidates = [
    { id: "Global", prefix: DRIVE_PREFIX },
    ...(email.trim() ? [{ id: "Personal", prefix: personalPrefix(email) }] : []),
    { id: "Deleted", prefix: DELETED_PREFIX },
  ];
  return candidates
    .map((c) => ({ ...c, policy: locationPolicy(access, email, c.prefix) }))
    .filter((c) => c.policy.read);
}

/**
 * What Home lists: every location the person can read. Nobody else's folder:
 * listing them would need the allowlist in the browser, and IAM denies opening
 * them anyway. Replaces the Amplify adapter's listLocations, which can only
 * derive paths from the identity ID.
 */
export function listDriveLocations(bucket: string, email: string, access: Access) {
  const items = driveLocations(bucket, email, access);
  return async () => ({ items, nextToken: undefined });
}

/**
 * The locations the person can read, in Home's order, as Storage Browser
 * locations: what Home lists and the sidebar links to (issue #13). `id` is
 * "Global", "Personal" or "Deleted".
 */
export function driveLocations(bucket: string, email: string, access: Access) {
  return homeLocations(email, access).map(({ id, prefix, policy }) => ({ id, ...storageLocation(bucket, prefix, policy) }));
}

/** Whether the person can write in any location ("+ New" is shown, disabled where they can't write). */
export function canWriteSomewhere(email: string, access: Access): boolean {
  return homeLocations(email, access).some((l) => l.policy.write);
}
