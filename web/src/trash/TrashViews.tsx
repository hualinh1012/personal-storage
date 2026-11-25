import { useState } from "react";
import { useDriveHost } from "../driveHost/hostContext";
import { useStableItems } from "../driveHost/stableItems";
import { failureLines as hostFailureLines, type BrowserParts, type Task } from "../driveHost/storageBrowser";
import { emptyDeleted, type EmptySummary, type TrashOps } from "./trash";
import { DELETE_PERMANENTLY_ACTION, RESTORE_ACTION } from "./actions";

/*
 * The Deleted folder's screens (issue #24). Restore and Delete permanently
 * reuse Storage Browser's Delete view *parts* (selected items table, statuses,
 * confirmation modal) inside DeleteView.Provider, the way MoveView reuses
 * Copy's, but run our actions and confirm before every start, not only for
 * folders. Empty Deleted is its own screen: one run over the whole folder.
 */

interface BatchCopy {
  action: string;
  title: string;
  hint: (count: number) => string;
  start: string;
  confirmTitle: string;
  confirmMessage: (count: number) => string;
  done: (counts: Record<string, number>) => string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Failed items with the reason, since the tasks table only shows a status. */
export function failureLines(tasks: Task[]): string[] {
  return hostFailureLines(tasks, (data) => (data as { key?: string }).key, "Failed.");
}

export const RESTORE_COPY: BatchCopy = {
  action: RESTORE_ACTION,
  title: "Restore",
  hint: (n) => `${n === 1 ? "This item goes" : "These items go"} back to where ${n === 1 ? "it was" : "they were"}. A file is never put over one that's already there.`,
  start: "Restore",
  confirmTitle: "Restore?",
  confirmMessage: (n) => `Put ${plural(n, "item")} back where ${n === 1 ? "it was" : "they were"}?`,
  done: (c) => `${plural(c.COMPLETE ?? 0, "item")} restored${c.FAILED ? `, ${c.FAILED} not restored` : ""}.`,
};

export const DELETE_PERMANENTLY_COPY: BatchCopy = {
  action: DELETE_PERMANENTLY_ACTION,
  title: "Delete permanently",
  hint: () => "These are removed from the bucket with every saved version. This can't be undone, not even from the AWS console.",
  start: "Delete permanently",
  confirmTitle: "Delete permanently?",
  confirmMessage: (n) => `${plural(n, "item")} will be gone for good. This can't be undone.`,
  done: (c) => `${plural(c.COMPLETE ?? 0, "item")} deleted permanently${c.FAILED ? `, ${c.FAILED} not deleted` : ""}.`,
};

function makeBatchView({ DeleteView, useView, useAction }: BrowserParts, copy: BatchCopy) {
  return function BatchView() {
    const selection = useView("Delete");
    // Delete's tasks already carry each selected file or folder.
    const items = useStableItems(selection.tasks);
    const [state, start] = useAction(copy.action, { items });
    const [confirming, setConfirming] = useState(false);
    const busy = state.isProcessing || state.isProcessingComplete;

    return (
      <div className={`amplify-storage-browser trash-view trash-view--${copy.action}`}>
        <DeleteView.Provider
          {...selection}
          {...state}
          onActionStart={() => setConfirming(true)}
          onActionCancel={() => state.tasks.forEach((t) => t.cancel?.())}
          confirmationModal={{
            isOpen: confirming,
            title: copy.confirmTitle,
            message: copy.confirmMessage(items.length),
            confirmLabel: copy.start,
            cancelLabel: "Cancel",
          }}
          onConfirmDelete={() => {
            setConfirming(false);
            start();
          }}
          onCancelConfirmation={() => setConfirming(false)}
        >
          <DeleteView.Exit />
          <h2 className="amplify-storage-browser__title">{copy.title}</h2>
          {!busy && <p className="move-hint">{copy.hint(items.length)}</p>}
          <div className="amplify-storage-browser__data-table">
            <DeleteView.TasksTable />
          </div>
          <div className="amplify-storage-browser__summary">
            <DeleteView.Statuses />
          </div>
          <div className="amplify-storage-browser__footer">
            {state.isProcessingComplete && (
              <div className="move-summary">
                <p>{copy.done(state.statusCounts)}</p>
                <ul>
                  {failureLines(state.tasks).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="amplify-storage-browser__buttons">
              <DeleteView.Cancel />
              <button
                type="button"
                className="amplify-button amplify-button--primary"
                disabled={busy || items.length === 0}
                onClick={() => setConfirming(true)}
              >
                {copy.start}
              </button>
            </div>
          </div>
          <DeleteView.ConfirmationModal />
        </DeleteView.Provider>
      </div>
    );
  };
}

/** The Deleted folder's views, keyed by the view names its actions use. */
export function makeTrashViews(parts: BrowserParts, storage: TrashOps) {
  return {
    RestoreView: makeBatchView(parts, RESTORE_COPY),
    DeletePermanentlyView: makeBatchView(parts, DELETE_PERMANENTLY_COPY),
    EmptyDeletedView: makeEmptyDeletedView(storage),
  };
}

type EmptyPhase =
  | { kind: "confirm" }
  | { kind: "running"; done: number; total: number }
  | { kind: "finished"; summary: EmptySummary }
  | { kind: "error"; message: string };

export function emptySummaryText({ removed, failed, firstError }: EmptySummary): string {
  if (removed === 0 && failed === 0) return "Deleted was already empty.";
  const base = `Removed ${plural(removed, "file version")} for good.`;
  return failed ? `${base} ${failed} couldn't be removed (${firstError}). Try again to finish.` : base;
}

/** "Empty Deleted": removes everything in the Deleted folder, every version, after confirming. */
function makeEmptyDeletedView(storage: TrashOps) {
  return function EmptyDeletedView() {
    const { exitToFolder } = useDriveHost();
    const [phase, setPhase] = useState<EmptyPhase>({ kind: "confirm" });

    const empty = async () => {
      setPhase({ kind: "running", done: 0, total: 0 });
      try {
        const summary = await emptyDeleted(storage, (done, total) => setPhase({ kind: "running", done, total }));
        setPhase({ kind: "finished", summary });
      } catch (error) {
        setPhase({ kind: "error", message: error instanceof Error ? error.message : String(error) });
      }
    };

    return (
      <div className="amplify-storage-browser drive-screen">
        <h2 className="amplify-storage-browser__title">Empty Deleted</h2>
        <div className="drive-screen__body">
          {phase.kind === "confirm" && (
            <p>
              Everything in Deleted is removed from the bucket with every saved version. This can't be undone, not even from the AWS
              console.
            </p>
          )}
          {phase.kind === "running" && <p>Removing… {phase.total ? `${phase.done} of ${phase.total}` : ""}</p>}
          {phase.kind === "finished" && <p>{emptySummaryText(phase.summary)}</p>}
          {phase.kind === "error" && <p className="drive-screen__error">Couldn't empty Deleted: {phase.message}</p>}
        </div>
        <div className="amplify-storage-browser__footer">
          <div className="amplify-storage-browser__buttons">
            <button type="button" className="amplify-button" disabled={phase.kind === "running"} onClick={exitToFolder}>
              {phase.kind === "confirm" ? "Cancel" : "Back"}
            </button>
            {phase.kind === "confirm" && (
              <button type="button" className="amplify-button amplify-button--primary" onClick={empty}>
                Empty Deleted
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };
}
