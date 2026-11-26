/**
 * Drive features (issue #40): each one that plugs into Storage Browser (Move,
 * the Deleted folder, Edit, Google import, the pager, previews, Upload) is one
 * `DriveFeature` value. The host (DriveView) takes a list of them and does the
 * wiring once, so a new feature is a folder of its own with no edit to the host.
 */
import type { ComponentType } from "react";
import type { Access } from "../access";
import type { LocationPolicy } from "../locationPolicy";
import type { BrowserParts } from "./storageBrowser";

/** What Storage Browser passes to its listing handler and gets back (the parts features use). */
export interface ListInput {
  config: unknown;
  prefix: string;
  options?: { nextToken?: string; pageSize?: number; exclude?: "FILE" | "FOLDER" };
}
export interface ListOutput {
  items: unknown[];
  nextToken?: string;
}
export type ListHandler = (input: ListInput) => Promise<ListOutput>;

/** Where the person is, for views and notes (DriveView provides it through `useDriveHost`). */
export interface HostState {
  email: string;
  access: Access;
  /** The open location, or null on Home. `path` is the folder inside it, ending in "/" (or ""). */
  location: { prefix: string; path: string } | null;
  /** The action view that's open, if any (Storage Browser's action type). */
  actionType?: string;
  /** Who can do what at the open location (Global/ on Home). */
  policy: LocationPolicy;
  /** Closes any action view and shows the folder again, re-listing it. */
  exitToFolder(): void;
  /**
   * True once if the person opened the open view from a New menu item with
   * this `pick` (File upload, Folder upload), so the view opens that picker.
   */
  takePick(kind: "files" | "folder"): boolean;
}

/** What a folder note is decided from: where the person is, without the host's functions. */
export type NoteHost = Pick<HostState, "email" | "access" | "location" | "actionType" | "policy">;

/**
 * An item in the "+ New" menu: opens one of the browser's actions for the open
 * folder. It needs `write` there. `pick` opens the upload view's file or
 * folder picker straight away (File upload, Folder upload).
 */
export interface NewMenuItem {
  label: string;
  /** A Material Symbols icon name. */
  icon: string;
  actionType: string;
  pick?: "files" | "folder";
}

export interface DriveFeature {
  /** For error messages and tests. */
  name: string;
  /** Built-in actions whose config this feature replaces (e.g. `delete`). */
  defaultActions?: Record<string, unknown>;
  /** Actions this feature adds to the ⋮ menu, keyed by action type; each names its view in `viewName`. */
  customActions?: Record<string, unknown>;
  /** The views its actions open, keyed by view name, built from Storage Browser's reusable parts. */
  views?(parts: BrowserParts): Record<string, ComponentType>;
  /** Storage Browser `displayText` overrides, per view. */
  displayText?: Record<string, Record<string, unknown>>;
  /** Wraps the file list's listing handler (applied in feature order). */
  wrapList?(handler: ListHandler): ListHandler;
  /** Storage Browser component slots (e.g. `Pagination`). */
  // Each slot takes Storage Browser's own props.
  components?: Record<string, ComponentType<never>>;
  /** Storage Browser's `filePreview` option. */
  filePreview?: unknown;
  /** Items in the "+ New" menu. */
  newMenu?: NewMenuItem[];
  /** A note above the file list, or null. */
  note?(host: NoteHost): string | null;
}

/** Everything the features add, merged. Pure, so it's tested without React. */
export interface ComposedFeatures {
  defaultActions: Record<string, unknown>;
  customActions: Record<string, unknown>;
  displayText: Record<string, Record<string, unknown>>;
  wrapList(handler: ListHandler): ListHandler;
  components: Record<string, ComponentType<never>>;
  filePreview?: unknown;
  newMenu: NewMenuItem[];
  views(parts: BrowserParts): Record<string, ComponentType>;
  notes(host: NoteHost): string[];
}

/** Merges features, refusing two that claim the same action, view, slot or New menu item. */
export function composeFeatures(features: readonly DriveFeature[]): ComposedFeatures {
  const claimed = new Map<string, string>();
  const claim = (kind: string, id: string, feature: DriveFeature) => {
    const owner = claimed.get(`${kind}:${id}`);
    if (owner) throw new Error(`Features "${owner}" and "${feature.name}" both define ${kind} "${id}".`);
    claimed.set(`${kind}:${id}`, feature.name);
  };

  const composed: ComposedFeatures = {
    defaultActions: {},
    customActions: {},
    displayText: {},
    wrapList: (h) => h,
    components: {},
    newMenu: [],
    views: () => ({}),
    notes: () => [],
  };
  let filePreviewOwner: string | undefined;
  for (const f of features) {
    for (const [type, config] of Object.entries(f.defaultActions ?? {})) {
      claim("action", type, f);
      composed.defaultActions[type] = config;
    }
    for (const [type, config] of Object.entries(f.customActions ?? {})) {
      claim("action", type, f);
      composed.customActions[type] = config;
    }
    for (const [view, text] of Object.entries(f.displayText ?? {})) {
      composed.displayText[view] = { ...composed.displayText[view], ...text };
    }
    for (const [slot, component] of Object.entries(f.components ?? {})) {
      claim("component", slot, f);
      composed.components[slot] = component;
    }
    for (const item of f.newMenu ?? []) {
      claim("New menu item", item.pick ? `${item.actionType} (${item.pick})` : item.actionType, f);
      composed.newMenu.push(item);
    }
    if (f.filePreview !== undefined) {
      if (filePreviewOwner) throw new Error(`Features "${filePreviewOwner}" and "${f.name}" both define filePreview.`);
      filePreviewOwner = f.name;
      composed.filePreview = f.filePreview;
    }
  }

  const wrappers = features.flatMap((f) => (f.wrapList ? [f.wrapList] : []));
  composed.wrapList = (handler) => wrappers.reduce((h, wrap) => wrap(h), handler);

  composed.views = (parts) => {
    const views: Record<string, ComponentType> = {};
    const owners = new Map<string, string>();
    for (const f of features) {
      for (const [name, view] of Object.entries(f.views?.(parts) ?? {})) {
        const owner = owners.get(name);
        if (owner) throw new Error(`Features "${owner}" and "${f.name}" both define view "${name}".`);
        owners.set(name, f.name);
        views[name] = view;
      }
    }
    return views;
  };

  composed.notes = (host) => features.flatMap((f) => f.note?.(host) ?? []).filter((n): n is string => !!n);
  return composed;
}
