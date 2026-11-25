/**
 * The one place that knows Storage Browser's internal shapes (issue #40).
 *
 * `@aws-amplify/ui-react-storage` exports its view parts, `useView` and
 * `useAction` with typings tied to its built-in actions, so composing them
 * with our own actions needs casts. They all live in `createHostedBrowser`;
 * features only see the loose, typed `BrowserParts` below. Re-check these
 * shapes after upgrading the package (behaviour pinned at 3.18.4).
 */
import type { ComponentType, ReactNode } from "react";
import type { ListHandler } from "./feature";
import {
  createStorageBrowser,
  defaultHandlers,
  type CreateStorageBrowserInput,
  type StorageBrowserEventValue,
  type StorageBrowserValue,
} from "@aws-amplify/ui-react-storage/browser";

/** One row of a view's task list: a selected file or folder and how its action went. */
export interface Task {
  data: unknown;
  status: string;
  message?: string;
  cancel?: () => void;
}

/** What `useAction` reports while our action runs over a selection. */
export interface ProcessState {
  isProcessing: boolean;
  isProcessingComplete: boolean;
  statusCounts: Record<string, number>;
  tasks: Task[];
}

/** A built-in view's state (`useView("Copy" | "Delete")`): its selection as tasks, plus props its Provider takes. */
export interface SelectionState extends Record<string, unknown> {
  tasks: Task[];
}

type Part = ComponentType;
type Provider = ComponentType<Record<string, unknown> & { children?: ReactNode }>;

/** Copy view parts a view can compose inside `CopyView.Provider`. */
export interface CopyViewParts {
  Provider: Provider;
  Exit: Part;
  TasksTable: Part;
  FoldersSearch: Part;
  FoldersPagination: Part;
  FoldersLoadingIndicator: Part;
  FoldersTable: Part;
  FoldersMessage: Part;
  Destination: Part;
  Statuses: Part;
  Cancel: Part;
}

/** Delete view parts a view can compose inside `DeleteView.Provider`. */
export interface DeleteViewParts {
  Provider: Provider;
  Exit: Part;
  TasksTable: Part;
  Statuses: Part;
  Cancel: Part;
  ConfirmationModal: Part;
}

/** What a feature's views may reuse from the browser. */
export interface BrowserParts {
  CopyView: CopyViewParts;
  DeleteView: DeleteViewParts;
  useView(name: "Copy" | "Delete"): SelectionState;
  useAction(name: string, options: { items: unknown[] }): [ProcessState, () => void];
}

export interface BrowserProps {
  defaultValue: StorageBrowserValue;
  onValueChange(value: StorageBrowserEventValue): void;
  views: Record<string, ComponentType>;
  displayText: Record<string, unknown>;
}

/** What the host passes to Storage Browser; action configs stay opaque to it. */
export interface BrowserInput {
  config: CreateStorageBrowserInput["config"];
  actions: { default: Record<string, unknown>; custom: Record<string, unknown> };
  filePreview?: unknown;
  // Storage Browser's component slots take its own prop types.
  components?: Record<string, ComponentType<never>>;
}

export interface HostedBrowser {
  Browser: ComponentType<BrowserProps & { key?: number }>;
  parts: BrowserParts;
}

/** Builds a browser; the host takes this so tests can pass a fake one. */
export type CreateBrowser = (input: BrowserInput) => HostedBrowser;

/** Storage Browser's own listing handler (S3 through Amplify), as the host's listing type. */
export const storageBrowserListHandler = defaultHandlers.listLocationItems as unknown as ListHandler;

/** The real Storage Browser. Every cast against its typings is here. */
export const createHostedBrowser: CreateBrowser = (input) => {
  const created = createStorageBrowser(input as unknown as CreateStorageBrowserInput);
  const sb = created.StorageBrowser;
  return {
    Browser: sb as unknown as HostedBrowser["Browser"],
    parts: {
      CopyView: sb.CopyView as unknown as CopyViewParts,
      DeleteView: sb.DeleteView as unknown as DeleteViewParts,
      useView: created.useView as unknown as BrowserParts["useView"],
      useAction: created.useAction as unknown as BrowserParts["useAction"],
    },
  };
};

/**
 * Failed tasks as "name: reason" lines, since Storage Browser's tasks table
 * shows only a status. `keyOf` picks the key to name each one by.
 */
export function failureLines(tasks: Task[], keyOf: (data: unknown) => string | undefined, fallback: string): string[] {
  return tasks
    .filter((t) => t.status === "FAILED")
    .map((t) => {
      const key = (keyOf(t.data) ?? "").replace(/\/$/, "");
      return `${key.slice(key.lastIndexOf("/") + 1)}: ${t.message ?? fallback}`;
    });
}
