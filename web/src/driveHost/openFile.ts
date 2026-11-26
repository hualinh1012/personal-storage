import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * How the open file shows: `viewer` is the full-screen popup (a click on its
 * name), `info` the panel beside the list with its details (⋮ → View info).
 */
export type OpenFileMode = "viewer" | "info";

/** One file row of the list as the viewer needs it: its id and its own download. */
export interface ListedFile {
  id: string;
  download?: () => void;
}

/**
 * Shared between the file list (FileTable), which knows why a file was opened
 * and each row's download, and the preview slot (preview/FileViewer), which
 * draws the open file. Storage Browser keeps which file is open; this only adds
 * how to show it. The list's files are set after each render and read when
 * needed, so setting them never re-renders anything.
 */
export interface OpenFileStore {
  getMode(): OpenFileMode;
  setMode(mode: OpenFileMode): void;
  subscribe(listener: () => void): () => void;
  /** The file rows on the open page, in list order. */
  getFiles(): readonly ListedFile[];
  setFiles(files: readonly ListedFile[]): void;
}

export function createOpenFileStore(): OpenFileStore {
  let mode: OpenFileMode = "viewer";
  let files: readonly ListedFile[] = [];
  const listeners = new Set<() => void>();
  return {
    getMode: () => mode,
    setMode: (next) => {
      if (next === mode) return;
      mode = next;
      for (const l of listeners) l();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getFiles: () => files,
    setFiles: (next) => {
      files = next;
    },
  };
}

export const OpenFileContext = createContext<OpenFileStore>(createOpenFileStore());

export function useOpenFileStore(): OpenFileStore {
  return useContext(OpenFileContext);
}

export function useOpenFileMode(): OpenFileMode {
  const store = useOpenFileStore();
  return useSyncExternalStore(store.subscribe, store.getMode);
}

/** "3 of 12" for a file among the listed ones, or undefined when it isn't listed. */
export function positionOf(files: readonly ListedFile[], id: string | undefined): { index: number; count: number } | undefined {
  const index = files.findIndex((f) => f.id === id);
  return index < 0 ? undefined : { index: index + 1, count: files.length };
}
