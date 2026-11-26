import { useContext } from "react";
import { componentsDefault } from "@aws-amplify/ui-react-storage/browser";
import { DriveHostContext } from "../driveHost/hostContext";
import { LOCATION_LABELS } from "../driveHost/locationLabels";
import { Icon } from "../theme/Icon";

/** Storage Browser's Navigation props (@aws-amplify/ui-react-storage 3.18.4). */
export interface NavigationProps {
  items: { isCurrent?: boolean; name?: string; onNavigate?: () => void }[];
}

/**
 * Storage Browser's `Navigation` slot as Drive's breadcrumb (issue #13): the
 * location's name ("Shared drive", "My files", "Deleted") then its folders,
 * large, with chevrons. Storage Browser starts it with Home and then
 * "<bucket>/<prefix>"; the sidebar replaces Home, so it's dropped, and the
 * location's own name replaces the bucket path.
 */
export function Breadcrumb({ items }: NavigationProps) {
  const host = useContext(DriveHostContext);
  const kind = host?.location ? host.policy.kind : "other";
  const fromHome = items.length > 1 && items[0].name === "Home";
  const shown = (fromHome ? items.slice(1) : items).map((item, i) =>
    i === 0 && fromHome && kind !== "other" ? { ...item, name: LOCATION_LABELS[kind].label } : item,
  );
  if (!shown.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol className="breadcrumb__list">
        {shown.map((item, i) => (
          <li key={i} className="breadcrumb__item">
            {i > 0 && <Icon name="chevron_right" className="breadcrumb__separator" />}
            {item.isCurrent ? (
              <span className="breadcrumb__current" aria-current="page">
                {item.name}
              </span>
            ) : (
              <button type="button" className="breadcrumb__link" onClick={item.onNavigate}>
                {item.name}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Storage Browser's `Title` slot: the breadcrumb already names the open folder, so its list has no title. */
export function Title(props: { title?: string }) {
  const host = useContext(DriveHostContext);
  if (host?.location && !host.actionType) return null;
  const Default = componentsDefault.Title;
  return Default ? <Default {...props} /> : null;
}
