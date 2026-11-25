import type { DriveFeature } from "../driveHost/feature";
import { EDIT_TEXT_ACTION, editTextActionConfig } from "./editAction";
import { makeEditTextView } from "./EditTextView";
import type { TextFileStorage } from "./textFile";

/** Edit (issue #45): a plain-text editor for one selected .txt file, over the drive storage. */
export function editFeature(storage: TextFileStorage): DriveFeature {
  return {
    name: "edit",
    customActions: { [EDIT_TEXT_ACTION]: editTextActionConfig },
    views: (parts) => ({ EditTextView: makeEditTextView(parts, storage) }),
  };
}
