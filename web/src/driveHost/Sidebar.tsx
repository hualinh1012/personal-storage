import type { ReactNode } from "react";
import { Icon } from "../theme/Icon";
import { KIND_OF_ID, LOCATION_LABELS } from "./locationLabels";

/** A location the sidebar links to: a Storage Browser location with an id from `driveLocations`. */
export interface SidebarLocation {
  id: string;
  prefix: string;
}

const labelOf = (id: string) => {
  const kind = KIND_OF_ID[id];
  return kind ? LOCATION_LABELS[kind] : { label: id, icon: "folder" };
};

/**
 * The left sidebar (issue #13): "+ New" on top, then the drive's locations
 * the person can read. On phones it's a drawer the top bar's menu button opens.
 */
export function Sidebar<L extends SidebarLocation>({
  newMenu,
  locations,
  currentPrefix,
  navigationDisabled,
  onOpen,
  open,
  onClose,
}: {
  newMenu: ReactNode;
  locations: readonly L[];
  /** The open location's prefix, or null on Home. */
  currentPrefix: string | null;
  /** While an action's view is open, leave it first (an import in progress would stop). */
  navigationDisabled: boolean;
  onOpen(location: L): void;
  /** Phones: whether the drawer is open. */
  open: boolean;
  onClose(): void;
}) {
  return (
    <>
      <nav className={open ? "sidebar sidebar--open" : "sidebar"} aria-label="Drive">
        {newMenu}
        <ul className="sidebar__list">
          {locations.map((location) => {
            const { label, icon } = labelOf(location.id);
            const current = location.prefix === currentPrefix;
            return (
              <li key={location.id}>
                <button
                  type="button"
                  className={current ? "sidebar__item sidebar__item--current" : "sidebar__item"}
                  aria-current={current ? "page" : undefined}
                  disabled={navigationDisabled}
                  title={navigationDisabled ? "Close the open view first" : undefined}
                  onClick={() => onOpen(location)}
                >
                  <Icon name={icon} filled={current} />
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {open && <div className="scrim" aria-hidden="true" onClick={onClose} />}
    </>
  );
}
