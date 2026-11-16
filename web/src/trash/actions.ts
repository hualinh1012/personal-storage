/**
 * Storage Browser actions for the Deleted folder (issue #24).
 *
 * Which ones show where comes from the Location policy (web/src/locationPolicy.ts):
 * - where the person can `move` (Global/ for writers, their own folder): the
 *   built-in Delete, whose handler we replace with "move to Deleted". There is
 *   no instant delete anywhere else in the app.
 * - where they can `manageDeleted` (only Deleted/): Restore, Delete permanently
 *   and Empty Deleted, and nothing that writes (Upload, Create folder, Copy, Move).
 */
import { defaultActionConfigs } from "@aws-amplify/ui-react-storage/browser";
import { hideUnless } from "../locationPolicy";
import { deletePermanently, moveToDeleted, restore, type Outcome, type TrashOps } from "./trash";

export interface TrashDeps {
  /** S3 operations as the signed-in person (the real bucket, or sample data in the playground). */
  ops(): Promise<TrashOps>;
  /** Whether the signed-in person may write at a key (`canWriteAt` in locationPolicy); Restore checks it to explain a refusal. */
  canWriteTo(key: string): boolean;
}

export const RESTORE_ACTION = "restore";
export const DELETE_PERMANENTLY_ACTION = "deletePermanently";
export const EMPTY_DELETED_ACTION = "emptyDeleted";

type HandlerInput = { data: { key: string } };

const run = (work: Promise<Outcome>) => ({
  result: work.then(
    (o) => (o.status === "COMPLETE" ? { status: "COMPLETE" as const } : { status: "FAILED" as const, message: o.message }),
    (error: unknown) => ({ status: "FAILED" as const, message: error instanceof Error ? error.message : String(error) }),
  ),
});

const noSelection = (selected?: unknown[]) => !selected || selected.length === 0;

export function makeTrashActions(deps: TrashDeps) {
  return {
    /** Replaces Storage Browser's Delete: same view and confirmation, but files go to Deleted/. */
    delete: {
      ...defaultActionConfigs.delete,
      actionListItem: {
        ...defaultActionConfigs.delete.actionListItem,
        hide: hideUnless("move"),
      },
      handler: ({ data }: HandlerInput) => run(deps.ops().then((ops) => moveToDeleted(data.key, ops))),
    },
    custom: {
      [RESTORE_ACTION]: {
        viewName: "RestoreView" as const,
        actionListItem: {
          icon: "folder" as const,
          label: "Restore",
          disable: noSelection,
          hide: hideUnless("manageDeleted"),
        },
        handler: ({ data }: HandlerInput) => run(deps.ops().then((ops) => restore(data.key, ops, deps.canWriteTo))),
      },
      [DELETE_PERMANENTLY_ACTION]: {
        viewName: "DeletePermanentlyView" as const,
        actionListItem: {
          icon: "delete-file" as const,
          label: "Delete permanently",
          disable: noSelection,
          hide: hideUnless("manageDeleted"),
        },
        handler: ({ data }: HandlerInput) => run(deps.ops().then((ops) => deletePermanently(data.key, ops))),
      },
      [EMPTY_DELETED_ACTION]: {
        // The work happens in EmptyDeletedView (one run over the whole folder,
        // not per selected item), so the handler is the no-op Storage Browser requires.
        viewName: "EmptyDeletedView" as const,
        actionListItem: {
          icon: "cancel" as const,
          label: "Empty Deleted",
          disable: () => false,
          hide: hideUnless("manageDeleted"),
        },
        handler: () => ({ result: Promise.resolve({ status: "COMPLETE" as const }) }),
      },
    },
  };
}

/** The Delete view's wording: it moves to Deleted rather than deleting. */
export const deleteViewDisplayText = {
  title: "Move to Deleted",
  actionStartLabel: "Delete",
  confirmationModalTitle: "Move folders to Deleted?",
  confirmationModalConfirmLabel: "Move to Deleted",
  confirmationModalMessage: "Everything in {count} folder{plural} will be moved to Deleted.",
  getActionCompleteMessage: (data?: CompleteData) => deleteCompleteMessage(data),
};

type CompleteData = {
  counts?: { COMPLETE?: number; FAILED?: number; TOTAL?: number };
  tasks?: { status: string; message?: string; data: { key: string } }[];
};

/** Storage Browser's tasks table shows only a status, so the reasons go in the message. */
export function deleteCompleteMessage(data?: CompleteData) {
  const { COMPLETE = 0, FAILED = 0, TOTAL = 0 } = data?.counts ?? {};
  const items = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;
  if (TOTAL === 0) return { content: "Nothing to delete.", type: "info" as const };
  if (FAILED === 0) return { content: `${items(COMPLETE)} moved to Deleted.`, type: "success" as const };
  const reasons = (data?.tasks ?? [])
    .filter((t) => t.status === "FAILED")
    .slice(0, 3)
    .map((t) => `${t.data.key.replace(/\/$/, "").split("/").pop()}: ${t.message ?? "not moved"}`);
  return {
    content: `${items(COMPLETE)} moved to Deleted, ${items(FAILED)} not moved. ${reasons.join(" ")}`.trim(),
    type: "error" as const,
  };
}
