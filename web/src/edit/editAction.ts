/**
 * Custom Storage Browser action: "Edit" in the ⋮ menu (issue #45), for exactly
 * one selected .txt file. Hidden where the location doesn't allow writing
 * (read-only Global/, Deleted/). The work happens in EditTextView, so the
 * handler is the no-op Storage Browser requires.
 */
import { canEditSelection } from "./text";

export const EDIT_TEXT_ACTION = "editText";

export const editTextActionConfig = {
  viewName: "EditTextView" as const,
  actionListItem: {
    icon: "file-text" as const,
    label: "Edit",
    disable: (selected?: { key: string; type?: string; size?: number }[]) => !canEditSelection(selected),
    hide: (permissions: string[]) => !permissions.includes("write"),
  },
  handler: () => ({ result: Promise.resolve({ status: "COMPLETE" as const }) }),
};
