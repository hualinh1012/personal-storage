import { useMemo, useState } from "react";
import { Amplify } from "aws-amplify";
import { signOutSafely } from "../session";
import {
  createAmplifyAuthAdapter,
  createStorageBrowser,
  type CreateStorageBrowserInput,
  type StorageBrowserEventValue,
  type StorageBrowserValue,
} from "@aws-amplify/ui-react-storage/browser";
import "@aws-amplify/ui-react-storage/styles.css";
import { driveLocation } from "../config";
import { filePreviewConfig, previewDisplayText } from "../preview/registry";
import { moveActionConfig } from "../move/moveAction";
import { makeMoveView, type MoveViewDeps } from "../move/MoveView";
import type { GoogleImportConfig } from "../config";
import { realGoogleImportDeps, type GoogleImportDeps } from "../googleImport/deps";
import { GOOGLE_IMPORT_ACTION, googleImportActionConfig } from "../googleImport/importAction";
import { GoogleImportContext, GoogleImportView, type GoogleImportContextValue } from "../googleImport/GoogleImportView";

type LocationValue = NonNullable<StorageBrowserValue["location"]>;
type StorageBrowserSetup =Pick<CreateStorageBrowserInput, "config" | "actions">;

/**
 * The drive screen. Takes the Storage Browser setup so the dev playground can
 * render the exact same layout with sample data instead of AWS.
 */
export function DriveView({
  email,
  bucket,
  setup,
  googleImport,
}: {
  email: string;
  bucket: string;
  setup: StorageBrowserSetup;
  googleImport: GoogleImportDeps;
}) {
  const { StorageBrowser, views } = useMemo(() => {
    const created = createStorageBrowser({
      ...setup,
      actions: {
        ...setup.actions,
        custom: {
          ...setup.actions?.custom,
          move: moveActionConfig as never,
          [GOOGLE_IMPORT_ACTION]: googleImportActionConfig as never,
        },
      },
      filePreview: filePreviewConfig,
    });
    const MoveView = makeMoveView({
      CopyView: created.StorageBrowser.CopyView as unknown as MoveViewDeps["CopyView"],
      useView: created.useView as unknown as MoveViewDeps["useView"],
      useAction: created.useAction as unknown as MoveViewDeps["useAction"],
    });
    return { StorageBrowser: created.StorageBrowser, views: { MoveView, GoogleImportView } };
  }, [setup]);

  // Storage Browser stays uncontrolled: in controlled mode it only reports
  // changes to its internal state, so an action opened from outside (our
  // Upload button) never reports its Exit and the view gets stuck. Instead we
  // track where the user is from onValueChange, and the Upload and Import
  // buttons remount the browser straight into that action's view for that folder.
  const [current, setCurrent] = useState<StorageBrowserValue>(() => ({ location: driveLocation(bucket) }));
  const [mount, setMount] = useState<{ key: number; defaultValue: StorageBrowserValue }>(() => ({
    key: 0,
    defaultValue: { location: driveLocation(bucket) },
  }));
  const onValueChange = (next: StorageBrowserEventValue) =>
    setCurrent({ actionType: next.actionType, location: next.location });
  const busy = current.actionType === "upload" || current.actionType === GOOGLE_IMPORT_ACTION;
  // Opens one of the browser's action views for the current folder by remounting into it.
  const openAction = (actionType: string) => {
    // A remount doesn't report its starting state, so record it ourselves;
    // Exit then reports the change back to no action.
    setCurrent((c) => ({ ...c, actionType }));
    setMount((m) => ({ key: m.key + 1, defaultValue: { location: current.location, actionType } }));
  };
  // Back to the folder's list. The remount also re-lists it, so imported files show up.
  const exitToFolder = () => {
    setCurrent((c) => ({ location: c.location }));
    setMount((m) => ({ key: m.key + 1, defaultValue: { location: current.location } }));
  };

  const location: LocationValue = current.location ?? driveLocation(bucket);
  const path = location.path ?? "";
  const importContext: GoogleImportContextValue = {
    deps: googleImport,
    prefix: location.prefix + path,
    folderLabel: path ? path.replace(/\/$/, "") : "Family Drive",
    onExit: exitToFolder,
  };

  return (
    <div className="drive">
      <header className="topbar">
        <strong>Family Drive</strong>
        <button
          type="button"
          className="primary"
          disabled={!current.location || busy}
          onClick={() => openAction("upload")}
        >
          Upload
        </button>
        <button type="button" disabled={!current.location || busy} onClick={() => openAction(GOOGLE_IMPORT_ACTION)}>
          Import from Google Drive
        </button>
        <span className="spacer" />
        <span>{email}</span>
        <button className="link" onClick={signOutSafely}>
          Sign out
        </button>
      </header>
      <main className="browser">
        <GoogleImportContext.Provider value={importContext}>
          <StorageBrowser
            key={mount.key}
            defaultValue={mount.defaultValue}
            views={views as never}
            onValueChange={onValueChange}
            displayText={previewDisplayText}
          />
        </GoogleImportContext.Provider>
      </main>
    </div>
  );
}

export default function Drive({ email, google }: { email: string; google: GoogleImportConfig | null }) {
  // Created after App has run Amplify.configure: the adapter reads the storage
  // config when it's built, so this can't live at module level.
  const { setup, bucket } = useMemo(
    () => ({
      setup: { config: createAmplifyAuthAdapter() },
      bucket: Amplify.getConfig().Storage?.S3?.bucket ?? "",
    }),
    [],
  );
  const googleImport = useMemo(() => realGoogleImportDeps(google), [google]);
  return <DriveView email={email} bucket={bucket} setup={setup} googleImport={googleImport} />;
}
