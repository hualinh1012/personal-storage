import { useStableItems } from "../driveHost/stableItems";
import { failureLines as hostFailureLines, type BrowserParts, type Task } from "../driveHost/storageBrowser";

/*
 * The Move screen. Storage Browser's Copy view is hard-wired to its copy
 * action, so this reuses Copy's *parts* (selected files table, destination
 * picker with search and paging, destination summary, statuses) inside
 * CopyView.Provider, and swaps in the "move" action for processing, plus our
 * own title, message and start button.
 */

export function summary(counts: Record<string, number>): string {
  const moved = counts.COMPLETE ?? 0;
  const failed = counts.FAILED ?? 0;
  const canceled = counts.CANCELED ?? 0;
  const parts = [`${moved} moved`];
  if (failed) parts.push(`${failed} not moved`);
  if (canceled) parts.push(`${canceled} canceled`);
  return parts.join(", ") + ".";
}

/** Failed files with the reason, since the tasks table only shows a status. */
export function failureLines(tasks: Task[]): string[] {
  return hostFailureLines(tasks, (data) => (data as { sourceKey?: string }).sourceKey, "Not moved.");
}

export function makeMoveView({ CopyView, useView, useAction }: BrowserParts) {
  return function MoveView() {
    const copy = useView("Copy");
    // Copy's tasks already carry each selected file with its key at the chosen destination.
    const items = useStableItems(copy.tasks);
    const [state, move] = useAction("move", { items });
    const busy = state.isProcessing || state.isProcessingComplete;

    return (
      <div className="amplify-storage-browser">
        <CopyView.Provider
          {...copy}
          {...state}
          onActionStart={move}
          onActionCancel={() => state.tasks.forEach((t) => t.cancel?.())}
        >
          <CopyView.Exit />
          <h2 className="amplify-storage-browser__title">Move</h2>
          <div className="amplify-storage-browser__data-table">
            <CopyView.TasksTable />
          </div>
          {!busy && (
            <>
              <p className="move-hint">Choose the folder to move {items.length === 1 ? "this file" : "these files"} into:</p>
              <div className="amplify-storage-browser__controls">
                <div className="amplify-storage-browser__search">
                  <CopyView.FoldersSearch />
                </div>
                <CopyView.FoldersPagination />
              </div>
              <div className="amplify-storage-browser__data-table">
                <CopyView.FoldersLoadingIndicator />
                <CopyView.FoldersTable />
                <CopyView.FoldersMessage />
              </div>
            </>
          )}
          <div className="amplify-storage-browser__summary">
            <CopyView.Destination />
            <CopyView.Statuses />
          </div>
          <div className="amplify-storage-browser__footer">
            {state.isProcessingComplete && (
              <div className="move-summary">
                <p>{summary(state.statusCounts)}</p>
                <ul>
                  {failureLines(state.tasks).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="amplify-storage-browser__buttons">
              <CopyView.Cancel />
              <button
                type="button"
                className="amplify-button amplify-button--primary"
                disabled={busy || items.length === 0}
                onClick={move}
              >
                Move
              </button>
            </div>
          </div>
        </CopyView.Provider>
      </div>
    );
  };
}
