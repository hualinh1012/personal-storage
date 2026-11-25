import type { DriveFeature } from "../driveHost/feature";
import { deleteViewDisplayText, makeTrashActions, type TrashDeps } from "./actions";
import { retentionNote } from "./retention";
import { makeTrashViews } from "./TrashViews";

/**
 * The Deleted folder (issue #24, ADR 0011): Delete moves to Deleted/ (it
 * replaces the built-in Delete's handler), and in Deleted/ Restore, Delete
 * permanently and Empty Deleted. In Deleted/'s file list, a note says when S3
 * removes its files (issue #25; `retentionDays` null hides it).
 */
export function trashFeature(deps: TrashDeps, retentionDays: number | null): DriveFeature {
  const actions = makeTrashActions(deps);
  return {
    name: "trash",
    defaultActions: { delete: actions.delete },
    customActions: actions.custom,
    views: (parts) => makeTrashViews(parts, deps.storage),
    displayText: { DeleteView: deleteViewDisplayText },
    note: (host) => (host.policy.kind === "deleted" ? retentionNote(retentionDays) : null),
  };
}
