import { useContext, type ReactNode } from "react";
import { DriveHostContext } from "../driveHost/hostContext";
import { Icon } from "../theme/Icon";

/** Storage Browser's Message props (@aws-amplify/ui-react-storage 3.18.4). */
export interface MessageProps {
  content?: ReactNode;
  id?: string;
  onDismiss?: (id?: string) => void;
  type?: "info" | "success" | "error" | "warning";
}

/** What the folder list says when it's empty (`listResultsText` below). */
export const EMPTY_FOLDER_MESSAGE = "This folder is empty.";
const LIST_ERROR_MESSAGE = "This folder couldn't be loaded.";

/** Storage Browser's `getListItemsResultMessage` data. */
interface ListResultsData {
  items?: unknown[];
  hasExhaustedSearch?: boolean;
  hasError?: boolean;
  message?: string;
  isLoading?: boolean;
}

/**
 * The folder list's result message, as Storage Browser's default
 * (@aws-amplify/ui-react-storage 3.18.4) but with our empty-folder text,
 * which `StatusMessage` draws as Drive's empty state.
 */
export const listResultsText = {
  LocationDetailView: {
    getListItemsResultMessage: ({ items, hasExhaustedSearch, hasError = false, message, isLoading }: ListResultsData = {}) => {
      if (isLoading) return undefined;
      if (hasError) return { type: "error" as const, content: message ?? LIST_ERROR_MESSAGE };
      if (!items?.length && hasExhaustedSearch) return { type: "info" as const, content: "No results found in the first 10,000 items." };
      if (!items?.length) return { type: "info" as const, content: EMPTY_FOLDER_MESSAGE };
      if (hasExhaustedSearch) return { type: "info" as const, content: "Showing results for up to the first 10,000 items." };
      return undefined;
    },
  },
};

const TYPE_ICONS = { info: "info", success: "check_circle", error: "error", warning: "warning" } as const;

/**
 * Storage Browser's `Message` slot (issue #13). On the folder list an empty
 * folder gets Drive's empty state and a failed listing an error with Try again
 * (which re-lists the folder); every other message is a Material banner.
 */
export function StatusMessage({ content, id, onDismiss, type = "info" }: MessageProps) {
  const host = useContext(DriveHostContext);
  const onList = !!host?.location && !host.actionType;
  if (!content) return null;

  if (onList && type === "info" && content === EMPTY_FOLDER_MESSAGE) {
    return (
      <div className="list-state" role="status">
        <Icon name="folder_open" className="list-state__icon" />
        <p className="list-state__title">{EMPTY_FOLDER_MESSAGE}</p>
        {host.policy.write && <p className="list-state__hint">Use + New to add files and folders.</p>}
      </div>
    );
  }
  if (onList && type === "error") {
    return (
      <div className="list-state list-state--error" role="alert">
        <Icon name="cloud_off" className="list-state__icon" />
        <p className="list-state__title">{content}</p>
        <button type="button" className="outlined button--with-icon" onClick={host.exitToFolder}>
          <Icon name="refresh" />
          Try again
        </button>
      </div>
    );
  }
  return (
    <div className={`banner banner--${type}`} role={type === "error" ? "alert" : "status"}>
      <Icon name={TYPE_ICONS[type]} />
      <div className="banner__content">{content}</div>
      {onDismiss && (
        <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => onDismiss(id)}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
