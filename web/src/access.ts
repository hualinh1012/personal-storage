/**
 * The signed-in person's access level (issue #15), from the ID-token claims the
 * pre token generation trigger adds. Display only: IAM enforces the same
 * claims through principal tags, so hiding a button is not the boundary.
 */
export interface Access {
  /** Can upload, delete, move and import in the shared drive (Global/). */
  globalWrite: boolean;
  /** Has a personal folder. */
  personal: boolean;
  /** Manages the Deleted folder: sees it, restores, deletes permanently, empties it (issue #24). */
  trash: boolean;
}

/** What IAM grants when the claims are missing: read-only Global/, no personal folder, no Deleted folder. */
export const READ_ONLY: Access = { globalWrite: false, personal: false, trash: false };

export function accessFromIdTokenPayload(payload: Record<string, unknown> | undefined): Access {
  return {
    globalWrite: payload?.global_access === "write",
    personal: payload?.personal === "yes",
    trash: payload?.trash === "yes",
  };
}
