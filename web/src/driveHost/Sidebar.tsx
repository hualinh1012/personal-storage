import type { ReactNode } from "react";
import { Icon } from "../theme/Icon";

/** A location the sidebar links to: a Storage Browser location with an id from `driveLocations`. */
export interface SidebarLocation {
  id: string;
  prefix: string;
}

/** How each of the drive's locations is named in the sidebar (GLOSSARY.md: shared drive, personal folder, Deleted folder). */
const LABELS: Record<string, { label: string; icon: string }> = {
  Global: { label: "Shared drive", icon: "folder_shared" },
  Personal: { label: "My files", icon: "person" },
  Deleted: { label: "Deleted", icon: "delete" },
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
            const { label, icon } = LABELS[location.id] ?? { label: location.id, icon: "folder" };
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
