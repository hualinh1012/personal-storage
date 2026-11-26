import { createContext, useContext, useSyncExternalStore } from "react";

/** Storage Browser's ActionsList item (@aws-amplify/ui-react-storage 3.18.4). */
export interface ActionItem {
  actionType: string;
  label?: string;
  icon?: string;
  isDisabled?: boolean;
  isHidden?: boolean;
}

export interface ActionsState {
  items: ActionItem[];
  onActionSelect?: (actionType: string) => void;
  isDisabled?: boolean;
}

/**
 * The folder's actions as Storage Browser last offered them (its ActionsList
 * slot publishes them here), so the selection toolbar and each row's ⋮ menu
 * offer exactly what its ⋮ menu offers, with the same hiding and disabling.
 */
export interface ActionsStore {
  get(): ActionsState;
  set(next: ActionsState): void;
  subscribe(listener: () => void): () => void;
  /** Actions on the folder, not the selection ("+ New"'s: Upload, Create folder, Import), left out of selection menus. */
  folderActions: ReadonlySet<string>;
}

export function createActionsStore(folderActions: Iterable<string> = []): ActionsStore {
  let state: ActionsState = { items: [] };
  const listeners = new Set<() => void>();
  return {
    folderActions: new Set(folderActions),
    get: () => state,
    set: (next) => {
      state = next;
      for (const l of listeners) l();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const empty = createActionsStore();
export const ActionsStoreContext = createContext<ActionsStore>(empty);

export function useActionsStore(): ActionsStore {
  return useContext(ActionsStoreContext);
}

/** The actions currently offered, re-rendering when they change. */
export function useActions(): ActionsState {
  const store = useActionsStore();
  return useSyncExternalStore(store.subscribe, store.get);
}

/** The actions to show: not hidden. */
export function visibleActions(state: ActionsState): ActionItem[] {
  return state.items.filter((i) => !i.isHidden);
}

/** The actions on a selection (the toolbar, a row's ⋮): visible, not folder actions. */
export function selectionActions(state: ActionsState, folderActions: ReadonlySet<string>): ActionItem[] {
  return visibleActions(state).filter((i) => !folderActions.has(i.actionType));
}
