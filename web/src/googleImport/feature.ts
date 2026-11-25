import type { DriveFeature } from "../driveHost/feature";
import type { GoogleImportDeps } from "./deps";
import { makeGoogleImportView } from "./GoogleImportView";
import { GOOGLE_IMPORT_ACTION, googleImportActionConfig } from "./importAction";

/** Import from Google Drive (⋮ menu and top bar), entirely in the browser (ADR 0001, ADR 0008). */
export function googleImportFeature(deps: GoogleImportDeps): DriveFeature {
  return {
    name: "googleImport",
    customActions: { [GOOGLE_IMPORT_ACTION]: googleImportActionConfig },
    views: () => ({ GoogleImportView: makeGoogleImportView(deps) }),
    topBar: [{ label: "Import from Google Drive", actionType: GOOGLE_IMPORT_ACTION }],
  };
}
