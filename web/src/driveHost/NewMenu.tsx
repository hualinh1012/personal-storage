import { useCallback, useRef, useState } from "react";
import { Icon } from "../theme/Icon";
import { useDismiss } from "../theme/useDismiss";
import type { NewMenuItem } from "./feature";

/**
 * The "+ New" button and its menu (issue #13): the features' New menu items
 * for the open folder. `fab` draws it as the phones' floating action button.
 */
export function NewMenu({
  items,
  disabled,
  disabledReason,
  onPick,
  fab = false,
}: {
  items: readonly NewMenuItem[];
  disabled: boolean;
  /** Why it's disabled, as its tooltip. */
  disabledReason?: string;
  onPick(item: NewMenuItem): void;
  fab?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useDismiss(open, useCallback(() => setOpen(false), []), root);
  // Closes when it becomes disabled (an action's view opened). Adjusted while
  // rendering, React's pattern for state that follows a prop, not in an effect.
  const [wasDisabled, setWasDisabled] = useState(disabled);
  if (disabled !== wasDisabled) {
    setWasDisabled(disabled);
    if (disabled) setOpen(false);
  }

  return (
    <div className={fab ? "new-menu new-menu--fab" : "new-menu"} ref={root}>
      <button
        type="button"
        className={fab ? "fab" : "new-button"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={fab ? "New" : undefined}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="add" />
        {!fab && <span>New</span>}
      </button>
      {open && (
        <div className="menu new-menu__menu" role="menu" aria-label="New">
          {items.map((item) => (
            <button
              key={`${item.actionType}:${item.pick ?? ""}`}
              type="button"
              role="menuitem"
              className="menu__item"
              onClick={() => {
                setOpen(false);
                onPick(item);
              }}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
