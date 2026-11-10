import { PAGE_SIZE } from "./rows";

/*
 * Watches Storage Browser's listLocationItems handler to learn what the file
 * list holds, and counts the open folder ourselves (S3 never reports how many
 * objects a prefix has). Wrapping the handler catches every reason to recount
 * in one place: opening a folder, Refresh, and returning to the list after an
 * action (upload, delete, move, create folder) all re-list the first page.
 */

/** What Storage Browser passes to listLocationItems (the parts we use). */
export interface ListInput<C = unknown> {
  config: C;
  prefix: string;
  options?: { nextToken?: string; pageSize?: number; exclude?: "FILE" | "FOLDER" };
}
export interface ListOutput {
  items: unknown[];
  nextToken?: string;
}
export type ListHandler<C = unknown> = (input: ListInput<C>) => Promise<ListOutput>;
/** Counts the rows the folder at `prefix` has across all pages. */
export type CountFolder<C = unknown> = (config: C, prefix: string) => Promise<number>;

export type FolderCount = { status: "counting" } | { status: "done"; total: number } | { status: "failed" };

export interface FolderState {
  /** The folder the file list shows (Storage Browser's full prefix), if any yet. */
  prefix?: string;
  /** "search": the list holds search results, so the folder's total doesn't apply. */
  mode: "browse" | "search";
  count: FolderCount;
  /** Rows Storage Browser has loaded for this folder: it appends every page it fetches. */
  loadedRows: number;
  hasMore: boolean;
  fetching: boolean;
  /** Bumped when a page request fails, so a jump in progress stops. */
  failures: number;
}

export interface FolderTracker<C = unknown> {
  wrap(handler: ListHandler<C>): ListHandler<C>;
  getState(): FolderState;
  subscribe(listener: () => void): () => void;
}

const INITIAL: FolderState = { mode: "browse", count: { status: "counting" }, loadedRows: 0, hasMore: false, fetching: false, failures: 0 };

export function createFolderTracker<C>(countFolder: CountFolder<C>, pageSize = PAGE_SIZE): FolderTracker<C> {
  let state = INITIAL;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<FolderState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  // Each first-page listing starts a new generation; results from older ones
  // (the person navigated away meanwhile) are dropped.
  let generation = 0;
  // Page requests by continuation token → the token after that page.
  let pages = new Map<string, Promise<string | undefined>>();
  // Reports a request as finished on a later task, after Storage Browser has
  // taken in its result (it applies it in a promise callback and renders after
  // that). A jump's next paginate then uses the browser's new continuation
  // token, and a pager re-render can never loop on microtasks alone.
  const finished = (gen: number) => setTimeout(() => gen === generation && set({ fetching: false }), 0);

  async function firstPage(handler: ListHandler<C>, input: ListInput<C>) {
    const gen = ++generation;
    pages = new Map();
    set({ prefix: input.prefix, mode: "browse", count: { status: "counting" }, loadedRows: 0, hasMore: false, fetching: true });
    countFolder(input.config, input.prefix).then(
      (total) => gen === generation && set({ count: { status: "done", total } }),
      () => gen === generation && set({ count: { status: "failed" } }),
    );
    try {
      const out = await handler(input);
      if (gen === generation) set({ loadedRows: out.items.length, hasMore: !!out.nextToken });
      return out;
    } finally {
      finished(gen);
    }
  }

  async function nextPage(handler: ListHandler<C>, input: ListInput<C>, token: string) {
    const gen = generation;
    // Asked for a page we already fetched: answer with nothing new rather than
    // let Storage Browser append the same rows twice. Can happen when a jump
    // re-paginates before the browser has taken in the last page's token.
    // It still counts as a request (fetching goes true, then false), so a jump
    // takes its next step once the browser has caught up.
    const known = pages.get(token);
    set({ fetching: true });
    if (known) {
      try {
        return { items: [], nextToken: await known };
      } finally {
        finished(gen);
      }
    }
    const request = handler(input);
    // Never rejects (a failed page is removed below); the catch keeps it from being unhandled.
    pages.set(token, request.then((out) => out.nextToken, () => token));
    try {
      const out = await request;
      if (gen === generation) set({ loadedRows: state.loadedRows + out.items.length, hasMore: !!out.nextToken });
      return out;
    } catch (error) {
      pages.delete(token);
      if (gen === generation) set({ failures: state.failures + 1 });
      throw error;
    } finally {
      finished(gen);
    }
  }

  return {
    wrap: (handler) => async (input) => {
      const { nextToken, pageSize: size, exclude } = input.options ?? {};
      // Copy/Move list destination folders only (exclude: FILE): not the file list.
      if (exclude) return handler(input);
      // Search fetches 1,000 at a time and filters what it found, so a folder
      // total would be wrong for it.
      if (size !== pageSize) {
        if (!nextToken) {
          generation++;
          set({ prefix: input.prefix, mode: "search", fetching: false });
        }
        return handler(input);
      }
      return nextToken ? nextPage(handler, input, nextToken) : firstPage(handler, input);
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
