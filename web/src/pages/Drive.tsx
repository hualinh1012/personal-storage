import { useMemo, useState } from "react";
import { Amplify } from "aws-amplify";
import { signOutSafely } from "../session";
import {
  createAmplifyAuthAdapter,
  createStorageBrowser,
  defaultHandlers,
  type CreateStorageBrowserInput,
  type StorageBrowserEventValue,
  type StorageBrowserValue,
} from "@aws-amplify/ui-react-storage/browser";
import "@aws-amplify/ui-react-storage/styles.css";
import { canWriteAt, canWriteSomewhere, driveLocation, listDriveLocations, locationPolicy } from "../locationPolicy";
import { retentionNote } from "../trash/retention";
import type { Access } from "../access";
import { filePreviewConfig, previewDisplayText } from "../preview/registry";
import { makeMoveActionConfig } from "../move/moveAction";
import { makeMoveView, type MoveViewDeps } from "../move/MoveView";
import type { GoogleImportConfig } from "../config";
import { realGoogleImportDeps, type GoogleImportDeps } from "../googleImport/deps";
import { GOOGLE_IMPORT_ACTION, googleImportActionConfig } from "../googleImport/importAction";
import { GoogleImportContext, GoogleImportView, type GoogleImportContextValue } from "../googleImport/GoogleImportView";
import { createFolderTracker } from "../pagination/folderTracker";
import { countFolder } from "../pagination/countFolder";
import { Pager, PagerContext, type PagerContextValue } from "../pagination/Pager";
import { deleteViewDisplayText, makeTrashActions } from "../trash/actions";
import { makeTrashViews, TrashContext, type TrashViewDeps } from "../trash/TrashViews";
import { fetchAuthSession } from "aws-amplify/auth";
import { EDIT_TEXT_ACTION, editTextActionConfig } from "../edit/editAction";
import { EditTextContext, makeEditTextView, type EditTextContextValue, type EditTextViewDeps } from "../edit/EditTextView";
import type { DriveStorage } from "../storage/driveStorage";
import { s3DriveStorage } from "../storage/s3Storage";

const displayText = {
  ...previewDisplayText,
  DeleteView: deleteViewDisplayText,
};

type LocationValue = NonNullable<StorageBrowserValue["location"]>;
type StorageBrowserSetup =Pick<CreateStorageBrowserInput, "config" | "actions">;

/**
 * The drive screen. Takes the Storage Browser setup so the dev playground can
 * render the exact same layout with sample data instead of AWS.
 */
export function DriveView({
  email,
  access,
  bucket,
  setup,
  storage,
  googleImport,
  deletedRetentionDays = null,
}: {
  email: string;
  /** Display only: IAM enforces the same access level. setup.config.listLocations must match it. */
  access: Access;
  bucket: string;
  setup: StorageBrowserSetup;
  /**
   * The files bucket as the signed-in person (S3 in the app, the in-memory drive
   * in the playground): every S3 call our own features make goes through it (#39).
   */
  storage: DriveStorage;
  /** Google's side of the import, with the same storage. */
  googleImport: GoogleImportDeps;
  /** Days before S3 removes files in Deleted/ (issue #25); null hides the note. */
  deletedRetentionDays?: number | null;
}) {
  // Delete moves files to Deleted/ (issue #24); Restore checks where the person may write.
  const trash = useMemo(() => ({ storage, canWriteTo: canWriteAt(access, email) }), [storage, access, email]);
  const { StorageBrowser, views, tracker } = useMemo(() => {
    // Watches the file list's listing so the pager can show the folder's total.
    const tracker = createFolderTracker<never>((prefix) => countFolder(storage, prefix));
    const listLocationItems = setup.actions?.default?.listLocationItems ?? defaultHandlers.listLocationItems;
    const trashActions = makeTrashActions(trash);
    const created = createStorageBrowser({
      ...setup,
      actions: {
        ...setup.actions,
        default: {
          ...setup.actions?.default,
          listLocationItems: tracker.wrap(listLocationItems as never) as never,
          // Delete moves to Deleted/; there is no instant delete outside it.
          delete: trashActions.delete as never,
        },
        custom: {
          ...setup.actions?.custom,
          move: makeMoveActionConfig(storage) as never,
          [GOOGLE_IMPORT_ACTION]: googleImportActionConfig as never,
          [EDIT_TEXT_ACTION]: editTextActionConfig as never,
          ...(trashActions.custom as unknown as Record<string, never>),
        },
      },
      filePreview: filePreviewConfig,
      components: { Pagination: Pager },
    });
    const MoveView = makeMoveView({
      CopyView: created.StorageBrowser.CopyView as unknown as MoveViewDeps["CopyView"],
      useView: created.useView as unknown as MoveViewDeps["useView"],
      useAction: created.useAction as unknown as MoveViewDeps["useAction"],
    });
    const trashViews = makeTrashViews({
      DeleteView: created.StorageBrowser.DeleteView as unknown as TrashViewDeps["DeleteView"],
      useView: created.useView as unknown as TrashViewDeps["useView"],
      useAction: created.useAction as unknown as TrashViewDeps["useAction"],
    });
    const EditTextView = makeEditTextView({ useView: created.useView as unknown as EditTextViewDeps["useView"] });
    return { StorageBrowser: created.StorageBrowser, views: { MoveView, GoogleImportView, EditTextView, ...trashViews }, tracker };
  }, [setup, storage, trash]);

  // Storage Browser stays uncontrolled: in controlled mode it only reports
  // changes to its internal state, so an action opened from outside (our
  // Upload button) never reports its Exit and the view gets stuck. Instead we
  // track where the user is from onValueChange, and the Upload and Import
  // buttons remount the browser straight into that action's view for that folder.
  const [current, setCurrent] = useState<StorageBrowserValue>(() => ({ location: driveLocation(bucket, access) }));
  const [mount, setMount] = useState<{ key: number; defaultValue: StorageBrowserValue }>(() => ({
    key: 0,
    defaultValue: { location: driveLocation(bucket, access) },
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

  const location: LocationValue = current.location ?? driveLocation(bucket, access);
  const policy = locationPolicy(access, email, location.prefix);
  // Upload and Import only where the open location allows writing; Home (no
  // location) shows them disabled when the person can write somewhere.
  const writable = !!current.location && policy.write;
  const showWriteButtons = current.location ? writable : canWriteSomewhere(email, access);
  const path = location.path ?? "";
  const importContext: GoogleImportContextValue = {
    deps: googleImport,
    prefix: location.prefix + path,
    folderLabel: path ? path.replace(/\/$/, "") : policy.kind === "personal" ? "My files" : "Family Drive",
    onExit: exitToFolder,
  };
  // The pager shows a folder total only in a folder's file list, not on Home or in an action's view.
  const pagerContext: PagerContextValue = {
    tracker,
    listPrefix: current.location && !current.actionType ? location.prefix + path : null,
  };
  // Leaving the editor remounts the browser, so the list shows the saved size and time.
  const editContext: EditTextContextValue = { storage, onExit: exitToFolder };
  // In the Deleted folder's file list, say when S3 removes its files.
  const note =
    current.location && !current.actionType && policy.kind === "deleted" ? retentionNote(deletedRetentionDays) : null;

  return (
    <div className="drive">
      <header className="topbar">
        <strong>Family Drive</strong>
        {showWriteButtons && (
          <>
            <button
              type="button"
              className="primary"
              disabled={!writable || busy}
              onClick={() => openAction("upload")}
            >
              Upload
            </button>
            <button type="button" disabled={!writable || busy} onClick={() => openAction(GOOGLE_IMPORT_ACTION)}>
              Import from Google Drive
            </button>
          </>
        )}
        <span className="spacer" />
        <span>{email}</span>
        <button className="link" onClick={signOutSafely}>
          Sign out
        </button>
      </header>
      <main className="browser">
        {note && (
          <p className="folder-note" role="note">
            {note}
          </p>
        )}
        <GoogleImportContext.Provider value={importContext}>
          <TrashContext.Provider value={{ deps: trash, onExit: exitToFolder }}>
            <EditTextContext.Provider value={editContext}>
              <PagerContext.Provider value={pagerContext}>
                <StorageBrowser
                  key={mount.key}
                  defaultValue={mount.defaultValue}
                  views={views as never}
                  onValueChange={onValueChange}
                  displayText={displayText as never}
                />
              </PagerContext.Provider>
            </EditTextContext.Provider>
          </TrashContext.Provider>
        </GoogleImportContext.Provider>
      </main>
    </div>
  );
}

export default function Drive({
  email,
  access,
  google,
  deletedRetentionDays,
}: {
  email: string;
  access: Access;
  google: GoogleImportConfig | null;
  deletedRetentionDays: number | null;
}) {
  // Created after App has run Amplify.configure: the adapter reads the storage
  // config when it's built, so this can't live at module level.
  const { setup, bucket } = useMemo(() => {
    const bucket = Amplify.getConfig().Storage?.S3?.bucket ?? "";
    // Home lists the shared drive and, if they have one, this person's folder (see listDriveLocations).
    const config = { ...createAmplifyAuthAdapter(), listLocations: listDriveLocations(bucket, email, access) };
    return { setup: { config }, bucket };
  }, [email, access]);
  const storage = useMemo(
    () =>
      s3DriveStorage({
        bucket,
        region: Amplify.getConfig().Storage?.S3?.region ?? "",
        // The SDK asks for credentials per request, so Amplify refreshes them as they expire.
        credentials: async () => {
          const { credentials } = await fetchAuthSession();
          if (!credentials) throw new Error("Not signed in.");
          return credentials;
        },
      }),
    [bucket],
  );
  const googleImport = useMemo(() => realGoogleImportDeps(google, storage), [google, storage]);
  return (
    <DriveView
      email={email}
      access={access}
      bucket={bucket}
      setup={setup}
      storage={storage}
      googleImport={googleImport}
      deletedRetentionDays={deletedRetentionDays}
    />
  );
}

