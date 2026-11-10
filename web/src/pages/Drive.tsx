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
import { canWrite, driveLocation, isDeletedPrefix, isPersonalPrefix, listDriveLocations } from "../config";
import { retentionNote } from "../trash/retention";
import type { Access } from "../access";
import { filePreviewConfig, previewDisplayText } from "../preview/registry";
import { moveActionConfig } from "../move/moveAction";
import { makeMoveView, type MoveViewDeps } from "../move/MoveView";
import type { GoogleImportConfig } from "../config";
import { realGoogleImportDeps, type GoogleImportDeps } from "../googleImport/deps";
import { GOOGLE_IMPORT_ACTION, googleImportActionConfig } from "../googleImport/importAction";
import { GoogleImportContext, GoogleImportView, type GoogleImportContextValue } from "../googleImport/GoogleImportView";
import { createFolderTracker, type CountFolder } from "../pagination/folderTracker";
import { countFolder } from "../pagination/countFolder";
import { Pager, PagerContext, type PagerContextValue } from "../pagination/Pager";
import { canWriteFor, deleteViewDisplayText, makeTrashActions, type TrashDeps } from "../trash/actions";
import { makeTrashViews, TrashContext, type TrashViewDeps } from "../trash/TrashViews";
import { s3TrashOps } from "../trash/s3Ops";
import type { TrashOps } from "../trash/trash";
import { fetchAuthSession } from "aws-amplify/auth";

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
  googleImport,
  countFolder,
  trash,
  deletedRetentionDays = null,
}: {
  email: string;
  /** Display only: IAM enforces the same access level. setup.config.listLocations must match it. */
  access: Access;
  bucket: string;
  setup: StorageBrowserSetup;
  googleImport: GoogleImportDeps;
  /** Counts a folder's rows for the pager's total (S3 in the app, sample data in the playground). */
  countFolder: CountFolder<never>;
  /** The Deleted folder's S3 operations (issue #24): Delete moves files there. */
  trash: TrashDeps;
  /** Days before S3 removes files in Deleted/ (issue #25); null hides the note. */
  deletedRetentionDays?: number | null;
}) {
  const { StorageBrowser, views, tracker } = useMemo(() => {
    // Watches the file list's listing so the pager can show the folder's total.
    const tracker = createFolderTracker(countFolder);
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
          move: moveActionConfig as never,
          [GOOGLE_IMPORT_ACTION]: googleImportActionConfig as never,
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
    return { StorageBrowser: created.StorageBrowser, views: { MoveView, GoogleImportView, ...trashViews }, tracker };
  }, [setup, countFolder, trash]);

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
  // Upload and Import only where the open location allows writing; Home (no
  // location) shows them disabled when the person can write somewhere.
  const writable = canWrite(current.location);
  const showWriteButtons = current.location ? writable : access.globalWrite || access.personal;
  const path = location.path ?? "";
  const importContext: GoogleImportContextValue = {
    deps: googleImport,
    prefix: location.prefix + path,
    folderLabel: path ? path.replace(/\/$/, "") : isPersonalPrefix(location.prefix) ? "My files" : "Family Drive",
    onExit: exitToFolder,
  };
  // The pager shows a folder total only in a folder's file list, not on Home or in an action's view.
  const pagerContext: PagerContextValue = {
    tracker,
    listPrefix: current.location && !current.actionType ? location.prefix + path : null,
  };
  // In the Deleted folder's file list, say when S3 removes its files.
  const note =
    current.location && !current.actionType && isDeletedPrefix(location.prefix) ? retentionNote(deletedRetentionDays) : null;

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
            <PagerContext.Provider value={pagerContext}>
              <StorageBrowser
                key={mount.key}
                defaultValue={mount.defaultValue}
                views={views as never}
                onValueChange={onValueChange}
                displayText={displayText as never}
              />
            </PagerContext.Provider>
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
  const googleImport = useMemo(() => realGoogleImportDeps(google), [google]);
  const trash = useMemo<TrashDeps>(() => {
    let ops: Promise<TrashOps> | undefined;
    return {
      // One S3 client, created on first use; it asks Amplify for fresh credentials per request.
      ops: () =>
        (ops ??= s3TrashOps({
          bucket,
          region: Amplify.getConfig().Storage?.S3?.region ?? "",
          credentials: async () => {
            const { credentials } = await fetchAuthSession();
            if (!credentials) throw new Error("Not signed in.");
            return credentials;
          },
        }).catch((error) => {
          ops = undefined;
          throw error;
        })),
      canWriteTo: canWriteFor(access, email),
    };
  }, [bucket, access, email]);
  return (
    <DriveView
      email={email}
      access={access}
      bucket={bucket}
      setup={setup}
      googleImport={googleImport}
      countFolder={countFolder as CountFolder<never>}
      trash={trash}
      deletedRetentionDays={deletedRetentionDays}
    />
  );
}
