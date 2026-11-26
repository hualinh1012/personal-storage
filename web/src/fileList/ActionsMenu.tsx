import { useCallback, useContext, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { DriveHostContext } from "../driveHost/hostContext";
import { Icon } from "../theme/Icon";
import { useDismiss } from "../theme/useDismiss";
import { useActionsStore, visibleActions, type ActionItem, type ActionsState } from "./actionsStore";
import { driveIcon } from "./icons";

/**
 * Storage Browser's `ActionsList` slot (its ⋮ menu), drawn as a Material 3
 * menu. On the folder list it also publishes what it offers to the actions
 * store, so the selection toolbar and the rows' ⋮ menus offer the same.
 */
export function ActionsMenu(props: ActionsState) {
  const store = useActionsStore();
  const host = useContext(DriveHostContext);
  const onList = !!host?.location && !host.actionType;
  useLayoutEffect(() => {
    if (onList) store.set({ items: props.items, onActionSelect: props.onActionSelect, isDisabled: props.isDisabled });
  });
  return <ActionsButton state={props} label="More actions" />;
}

/** A menu item of the host's own, not one of Storage Browser's actions (a row's View info). */
export interface ExtraMenuItem {
  id: string;
  label: string;
  /** A Material Symbols icon name. */
  icon: string;
  onSelect(): void;
}

/** A ⋮ button and its menu of actions; `extra` items come first. `onOpen` runs first (a row selects itself). */
export function ActionsButton({
  state,
  label,
  onOpen,
  className,
  extra = [],
}: {
  state: ActionsState;
  label: string;
  onOpen?: () => void;
  className?: string;
  extra?: ExtraMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  // Fixed to the viewport next to the button, so the list's scrolling doesn't
  // clip it; above the button when there's more room there.
  const [place, setPlace] = useState<CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  useDismiss(open, useCallback(() => setOpen(false), []), root);
  const items = visibleActions(state);
  const toggle = (button: HTMLElement) => {
    if (!open) {
      onOpen?.();
      const r = button.getBoundingClientRect();
      const right = Math.max(8, window.innerWidth - r.right);
      const below = window.innerHeight - r.bottom;
      setPlace(below >= 280 || below >= r.top ? { position: "fixed", right, top: r.bottom + 4 } : { position: "fixed", right, bottom: window.innerHeight - r.top + 4 });
    }
    setOpen((o) => !o);
  };
  return (
    <div className={["actions-menu", className ?? ""].join(" ")} ref={root}>
      <button
        type="button"
        className="icon-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={state.isDisabled}
        onClick={(e) => toggle(e.currentTarget)}
      >
        <Icon name="more_vert" />
      </button>
      {open && (
        <div className="menu actions-menu__menu" role="menu" aria-label={label} style={place}>
          {extra.map((item) => (
            <button key={item.id} type="button" role="menuitem" className="menu__item" onClick={() => (setOpen(false), item.onSelect())}>
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
          <ActionMenuItems items={items} onSelect={(type) => (setOpen(false), state.onActionSelect?.(type))} />
        </div>
      )}
    </div>
  );
}

export function ActionMenuItems({ items, onSelect }: { items: ActionItem[]; onSelect(actionType: string): void }) {
  return (
    <>
      {items.map((item) => {
        const icon = driveIcon(item.icon);
        return (
          <button key={item.actionType} type="button" role="menuitem" className="menu__item" disabled={item.isDisabled} onClick={() => onSelect(item.actionType)}>
            {icon ? <Icon name={icon.name} /> : <span className="icon" />}
            {item.label ?? item.actionType}
          </button>
        );
      })}
    </>
  );
}
