import { createContext, useContext, useId, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../theme/Icon";
import { DriveHostContext } from "./hostContext";

/** Storage Browser's SearchField props (@aws-amplify/ui-react-storage 3.18.4). */
export interface SearchFieldProps {
  id?: string;
  label?: string;
  clearLabel?: string;
  submitLabel?: string;
  query?: string;
  placeholder?: string;
  onSearch?: () => void;
  onClear?: () => void;
  onQueryChange?: (query: string) => void;
}

/** Where the top bar's search box goes; DriveView provides the element. */
export const TopBarSearchSlot = createContext<HTMLElement | null>(null);

/**
 * Storage Browser's `SearchField` slot, drawn as a large rounded search bar
 * (Material 3). It searches the open folder as before: Storage Browser keeps
 * the query and runs the search; this only draws it. On the folder list (and
 * Home) it's portalled into the top bar; inside an action's view (Copy's
 * destination picker) it stays where Storage Browser puts it.
 */
export function TopBarSearch(props: SearchFieldProps) {
  const slot = useContext(TopBarSearchSlot);
  const host = useContext(DriveHostContext);
  const inTopBar = !!slot && !host?.actionType;
  const field = <SearchBox {...props} large={inTopBar} />;
  return inTopBar ? createPortal(field, slot) : field;
}

function SearchBox({ id, label, clearLabel, submitLabel, query, placeholder, onSearch, onClear, onQueryChange, large }: SearchFieldProps & { large: boolean }) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch?.();
  };
  return (
    <form role="search" className={large ? "search-box search-box--large" : "search-box"} onSubmit={submit}>
      <button type="submit" className="icon-button" aria-label={submitLabel ?? "Search"}>
        <Icon name="search" />
      </button>
      <label className="visually-hidden" htmlFor={inputId}>
        {label ?? placeholder ?? "Search"}
      </label>
      <input
        id={inputId}
        className="search-box__input"
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={query ?? ""}
        onChange={(e) => onQueryChange?.(e.target.value)}
      />
      {!!query && (
        <button type="button" className="icon-button" aria-label={clearLabel ?? "Clear search"} onClick={() => onClear?.()}>
          <Icon name="close" />
        </button>
      )}
    </form>
  );
}
