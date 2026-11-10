import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { FolderState, FolderTracker } from "./folderTracker";
import { jumpStep, pageCount, pageLinks } from "./rows";

/** Storage Browser's Pagination props (@aws-amplify/ui-react-storage 3.18.4). */
export interface PagerProps {
  page?: number;
  hasNextPage?: boolean;
  highestPageVisited?: number;
  onPaginate?: (page: number) => void;
}

export interface PagerContextValue {
  tracker: FolderTracker<never>;
  /** The folder whose file list is open (full prefix), or null in other views (Home, actions). */
  listPrefix: string | null;
}

export const PagerContext = createContext<PagerContextValue | null>(null);

const NO_TRACKER: FolderTracker<never> = {
  wrap: (h) => h,
  getState: () => ({ mode: "browse", count: { status: "failed" }, loadedRows: 0, hasMore: false, fetching: false, failures: 0 }),
  subscribe: () => () => {},
};

/** The folder total, when it's known and applies to the list on screen. */
function totalFor(state: FolderState, listPrefix: string | null): number | undefined {
  if (listPrefix === null || state.prefix !== listPrefix || state.mode !== "browse") return undefined;
  return state.count.status === "done" ? state.count.total : undefined;
}

/**
 * Replaces Storage Browser's pager (`components.Pagination`). In a folder's
 * file list it shows "Page X of N · M items" and every page number once we've
 * counted the folder. While counting, if the count failed, during a search
 * and in other views it falls back to the pages visited so far plus Next.
 */
export function Pager({ page, hasNextPage, highestPageVisited, onPaginate }: PagerProps) {
  const ctx = useContext(PagerContext);
  const tracker = ctx?.tracker ?? NO_TRACKER;
  const state = useSyncExternalStore(tracker.subscribe, tracker.getState);
  const listPrefix = ctx?.listPrefix ?? null;
  // The tracker describes the list only in the open folder's file list; other
  // views (Home, Copy's destination picker) page through their own items.
  const tracked = listPrefix !== null && state.prefix === listPrefix;
  const total = totalFor(state, listPrefix);
  const [target, setTarget] = useState<number>();

  // Drop a jump in progress when the folder is re-listed or a page fails to load.
  const listing = `${state.prefix}|${state.mode}|${state.failures}`;
  useEffect(() => setTarget(undefined), [listing]);

  // A jump to a later page: Storage Browser fetches one page per paginate call,
  // so keep asking for the target until it has the rows to show it.
  const { loadedRows, hasMore, fetching } = state;
  useEffect(() => {
    if (target === undefined || page === undefined) return;
    const step = jumpStep({ target, page, loadedRows, hasMore, fetching });
    if (step === "paginate") onPaginate?.(target);
    if (step === "done") setTarget(undefined);
    // onPaginate is a new function on every render of the list; leaving it out
    // keeps each step tied to a change in what's loaded.
  },[target, page, loadedRows, hasMore, fetching]);

  if (!page) return null;
  const known = total !== undefined;
  const lastPage = known ? Math.max(pageCount(total), page) : Math.max(highestPageVisited ?? page, page);
  const links = known ? pageLinks(page, lastPage) : Array.from({ length: lastPage }, (_, i) => i + 1);
  const busy = tracked && (fetching || target !== undefined);
  const hasNext = known ? page < lastPage : page < lastPage || !!hasNextPage;

  const go = (p: number) => {
    if (p === page || busy) return;
    if (p > page && tracked) setTarget(p);
    else onPaginate?.(p);
  };

  return (
    <nav aria-label="Pagination" className="pager" aria-busy={busy}>
      <button type="button" className="pager-button" aria-label="Go to previous page" disabled={page <= 1 || busy} onClick={() => go(page - 1)}>
        ‹
      </button>
      {links.map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={p === page ? "pager-button pager-current" : "pager-button"}
            aria-label={`Page ${p}`}
            aria-current={p === page ? "page" : undefined}
            disabled={busy && p !== page}
            onClick={() => go(p)}
          >
            {p === target ? <span className="pager-loading">{p}</span> : p}
          </button>
        ),
      )}
      <button type="button" className="pager-button" aria-label="Go to next page" disabled={!hasNext || busy} onClick={() => go(page + 1)}>
        ›
      </button>
      {known && (
        <span className="pager-summary">
          Page {page} of {lastPage} · {total.toLocaleString()} {total === 1 ? "item" : "items"}
        </span>
      )}
    </nav>
  );
}
