import { useContext, type MouseEvent, type ReactNode } from "react";
import { DriveHostContext } from "../driveHost/hostContext";
import { Icon } from "../theme/Icon";
import { ActionMenuItems, ActionsButton } from "./ActionsMenu";
import { selectionActions, useActions, useActionsStore } from "./actionsStore";
import { driveIcon } from "./icons";

/*
 * Storage Browser's `DataTable` slot (issue #13), drawn the Drive way: type
 * icons per row, hover and selection colours, a toolbar while rows are
 * selected and a ⋮ menu per row on the folder list. The table keeps Storage
 * Browser's `amplify-storage-browser__table` class, which other CSS (phone
 * columns, Restore's hidden column) relies on; its cells don't, since Storage
 * Browser's cell styles (no wrapping, ellipsis) fight ours. Typings mirror
 * @aws-amplify/ui-react-storage 3.18.4's DataTable props.
 */

type SortDirection = "ascending" | "descending";
type Header =
  | { key: string; type: "checkbox"; content: { checked?: boolean; label?: string; onSelect?: () => void; id?: string } }
  | { key: string; type: "sort"; content: { label?: string; sortDirection?: SortDirection; onSort?: () => void } }
  | { key: string; type: "text"; content: { text?: string } };
type Cell =
  | { key: string; type: "button"; content: { icon?: string; label?: string; onClick?: () => void; ariaLabel?: string; isDisabled?: boolean } }
  | { key: string; type: "checkbox"; content: { checked?: boolean; label?: string; onSelect?: () => void; id?: string } }
  | { key: string; type: "date"; content: { value?: Date; displayValue?: string } }
  | { key: string; type: "number"; content: { value?: number; displayValue?: string } }
  | { key: string; type: "text"; content: { icon?: string; text?: string } };
export interface FileTableProps {
  headers: Header[];
  isLoading?: boolean;
  rows: { key: string; active?: boolean; content: Cell[] }[];
}

const B = "amplify-storage-browser";
/** Placeholder rows while a page loads. */
const SKELETON_ROWS = 6;

type CheckboxCell = Extract<Cell, { type: "checkbox" }>;
const checkboxOf = (row: FileTableProps["rows"][number]) => row.content.find((c): c is CheckboxCell => c.type === "checkbox");

export function FileTable({ headers, isLoading, rows }: FileTableProps) {
  const host = useContext(DriveHostContext);
  // The open folder's file list (not Home, not an action's view): rows get a ⋮ menu and the toolbar.
  const onList = !!host?.location && !host.actionType;
  const selected = rows.filter((r) => checkboxOf(r)?.content.checked);
  const selectable = rows.some((r) => checkboxOf(r));
  const rowMenus = onList && selectable;
  const clearSelection = () => selected.forEach((r) => checkboxOf(r)?.content.onSelect?.());
  // Selects this row alone, for its ⋮ menu.
  const selectOnly = (row: FileTableProps["rows"][number]) => {
    for (const r of selected) if (r !== row) checkboxOf(r)?.content.onSelect?.();
    const box = checkboxOf(row);
    if (box && !box.content.checked) box.content.onSelect?.();
  };
  // A click on a row's empty space toggles it, like Drive; its buttons and checkbox act as before.
  const onRowClick = (e: MouseEvent, row: FileTableProps["rows"][number]) => {
    if ((e.target as HTMLElement).closest("button, input, a, label, .menu")) return;
    checkboxOf(row)?.content.onSelect?.();
  };

  return (
    <>
      {onList && selected.length > 0 && <SelectionToolbar count={selected.length} onClear={clearSelection} />}
      <table className={`${B}__table file-table`} aria-busy={isLoading || undefined}>
        <thead>
          {headers.length > 0 && (
            <tr>
              {headers.map((h) => (
                <th key={h.key} scope="col">
                  {renderHeader(h)}
                </th>
              ))}
              {rowMenus && <th className="file-table__menu-cell" aria-label="Actions" />}
            </tr>
          )}
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <tr key={`skeleton-${i}`} className="file-table__skeleton" aria-hidden="true">
                  {headers.map((h) => (
                    <td key={h.key}>
                      <span className="skeleton" />
                    </td>
                  ))}
                  {rowMenus && <td className="file-table__menu-cell" />}
                </tr>
              ))
            : rows.map((row) => {
                const checked = !!checkboxOf(row)?.content.checked;
                const className = [row.active ? "file-table__row--active" : "", checked ? "file-table__row--selected" : ""].join(" ").trim() || undefined;
                return (
                  <tr key={row.key} className={className} aria-selected={checkboxOf(row) ? checked : undefined} onClick={(e) => onRowClick(e, row)}>
                    {row.content.map((cell) => (
                      <td key={cell.key}>
                        {renderCell(cell)}
                      </td>
                    ))}
                    {rowMenus && (
                      <td className="file-table__menu-cell">
                        {checkboxOf(row) && <RowMenu name={nameOf(row)} onOpen={() => selectOnly(row)} />}
                      </td>
                    )}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </>
  );
}

/** The row's name, for its ⋮ button's label. */
function nameOf(row: FileTableProps["rows"][number]): string {
  for (const c of row.content) {
    if (c.type === "button" && c.content.label) return c.content.label;
    if (c.type === "text" && c.content.text && c.content.icon) return c.content.text;
  }
  return "item";
}

function RowMenu({ name, onOpen }: { name: string; onOpen(): void }) {
  const actions = useActions();
  const { folderActions } = useActionsStore();
  const state = { ...actions, items: selectionActions(actions, folderActions) };
  return <ActionsButton state={state} label={`Actions for ${name}`} onOpen={onOpen} className="file-table__row-menu" />;
}

/** Drive's bar over the list while rows are selected: the count, clear, and the actions as buttons. */
function SelectionToolbar({ count, onClear }: { count: number; onClear(): void }) {
  const actions = useActions();
  const { folderActions } = useActionsStore();
  const items = selectionActions(actions, folderActions).filter((i) => !i.isDisabled);
  return (
    <div className="selection-toolbar" role="toolbar" aria-label="Selected items">
      <button type="button" className="icon-button" aria-label="Clear selection" onClick={onClear}>
        <Icon name="close" />
      </button>
      <span className="selection-toolbar__count">{count} selected</span>
      <div className="selection-toolbar__actions">
        <ActionMenuItems items={items} onSelect={(type) => actions.onActionSelect?.(type)} />
      </div>
    </div>
  );
}

function FileIcon({ variant }: { variant?: string }) {
  const icon = driveIcon(variant);
  if (!icon) return null;
  return <Icon name={icon.name} filled={icon.filled} className={icon.kind ? `file-icon file-icon--${icon.kind}` : "file-icon"} />;
}

function renderHeader(h: Header): ReactNode {
  switch (h.type) {
    case "checkbox":
      return <Checkbox {...h.content} label={h.content.label ?? "Select all"} />;
    case "sort": {
      const { label, sortDirection, onSort } = h.content;
      return (
        <button type="button" className="file-table__sort" onClick={onSort} aria-sort={sortDirection}>
          {label}
          {sortDirection && <Icon name={sortDirection === "ascending" ? "arrow_upward" : "arrow_downward"} />}
        </button>
      );
    }
    default:
      return <span className="file-table__text-header">{h.content.text}</span>;
  }
}

function renderCell(cell: Cell): ReactNode {
  switch (cell.type) {
    case "checkbox":
      return <Checkbox {...cell.content} label={cell.content.label ?? "Select"} />;
    case "button": {
      const { icon, label, onClick, ariaLabel, isDisabled } = cell.content;
      const iconOnly = !!icon && !label;
      return (
        <button
          type="button"
          className={iconOnly ? "file-table__button icon-button" : "file-table__button"}
          disabled={isDisabled}
          onClick={onClick}
          aria-label={ariaLabel}
        >
          <FileIcon variant={icon} />
          {label && <span className="file-table__name">{label}</span>}
        </button>
      );
    }
    case "date":
      return <span>{cell.content.displayValue ?? cell.content.value?.toLocaleString()}</span>;
    case "number":
      return <span>{cell.content.displayValue ?? cell.content.value}</span>;
    default:
      return (
        <span className="file-table__text">
          <FileIcon variant={cell.content.icon} />
          <span title={cell.content.text}>
            {cell.content.text}
          </span>
        </span>
      );
  }
}

function Checkbox({ checked, label, onSelect, id }: { checked?: boolean; label: string; onSelect?: () => void; id?: string }) {
  return <input type="checkbox" className="file-table__checkbox" id={id} aria-label={label} checked={!!checked} onChange={() => onSelect?.()} />;
}
