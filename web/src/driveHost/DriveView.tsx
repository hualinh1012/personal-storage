import { useMemo, useRef, useState } from "react";
import {
  type CreateStorageBrowserInput,
  type StorageBrowserEventValue,
  type StorageBrowserValue,
} from "@aws-amplify/ui-react-storage/browser";
import "@aws-amplify/ui-react-storage/styles.css";
import type { Access } from "../access";
import { ActionsMenu } from "../fileList/ActionsMenu";
import { ActionsStoreContext, createActionsStore } from "../fileList/actionsStore";
import { Breadcrumb, Title } from "../fileList/Breadcrumb";
import { FileTable } from "../fileList/FileTable";
import { listResultsText, StatusMessage } from "../fileList/StatusMessage";
import { canWriteSomewhere, driveLocation, driveLocations, locationPolicy } from "../locationPolicy";
import { signOutSafely } from "../session";
import { Icon } from "../theme/Icon";
import { composeFeatures, type DriveFeature, type HostState, type ListHandler, type NewMenuItem } from "./feature";
import { AccountMenu } from "./AccountMenu";
import { DriveHostContext } from "./hostContext";
import { createOpenFileStore, OpenFileContext } from "./openFile";
import { NewMenu } from "./NewMenu";
import { Sidebar } from "./Sidebar";
import { TopBarSearch, TopBarSearchSlot } from "./TopBarSearch";
import { createHostedBrowser, storageBrowserListHandler, type CreateBrowser } from "./storageBrowser";

type LocationValue = NonNullable<StorageBrowserValue["location"]>;

export interface BrowserSetup {
  config: CreateStorageBrowserInput["config"];
  /** The listing handler; Storage Browser's own (S3 through Amplify) when absent. The playground passes sample data. */
  listLocationItems?: ListHandler;
}

/**
 * The drive screen and the host for every drive feature (issue #40). It owns
 * Storage Browser: builds it from the features' actions, views, display text
 * and slots, keeps track of where the person is, and remounts it to open an
 * action from the "+ New" menu, to open a sidebar location or to leave a
 * feature's view. It also draws the top bar and the sidebar. Features never see
 * Storage Browser's typings or the remount; they get `BrowserParts` and
 * `useDriveHost()` (where the person is, and `exitToFolder`).
 *
 * Storage Browser stays uncontrolled: in controlled mode it only reports
 * changes to its internal state, so an action opened from outside (a New menu
 * item) never reports its Exit and the view gets stuck. Instead the host
 * tracks where the person is from onValueChange, and remounts the browser
 * (a new `key`) straight into an action's view, or back to the folder.
 */
export function DriveView({
  email,
  access,
  bucket,
  setup,
  features,
  createBrowser = createHostedBrowser,
}: {
  email: string;
  /** Display only: IAM enforces the same access level. setup.config.listLocations must match it. */
  access: Access;
  bucket: string;
  setup: BrowserSetup;
  features: readonly DriveFeature[];
  /** Tests pass a fake browser. */
  createBrowser?: CreateBrowser;
}) {
  const composed = useMemo(() => composeFeatures(features), [features]);
  // The host's own wording (the empty-folder text StatusMessage draws), under the features'.
  const displayText = useMemo(
    () => ({
      ...composed.displayText,
      LocationDetailView: { ...listResultsText.LocationDetailView, ...composed.displayText.LocationDetailView },
    }),
    [composed],
  );
  const { Browser, views } = useMemo(() => {
    const list = setup.listLocationItems ?? storageBrowserListHandler;
    const hosted = createBrowser({
      config: setup.config,
      actions: {
        default: { ...composed.defaultActions, listLocationItems: composed.wrapList(list) },
        custom: composed.customActions,
      },
      filePreview: composed.filePreview,
      // The host's own look (#13) under the features' slots: the top bar's
      // search, the Drive-style file list, ⋮ menu and breadcrumb.
      components: {
        SearchField: TopBarSearch,
        DataTable: FileTable,
        ActionsList: ActionsMenu,
        Navigation: Breadcrumb,
        Title,
        Message: StatusMessage,
        ...composed.components,
      },
    });
    return { Browser: hosted.Browser, views: composed.views(hosted.parts) };
  }, [composed, setup, createBrowser]);

  const home = () => ({ location: driveLocation(bucket, access) });
  const [current, setCurrent] = useState<StorageBrowserValue>(home);
  const [mount, setMount] = useState<{ key: number; defaultValue: StorageBrowserValue }>(() => ({ key: 0, defaultValue: home() }));
  const onValueChange = (next: StorageBrowserEventValue) => setCurrent({ actionType: next.actionType, location: next.location });
  // The picker a New menu item asked for, until the upload view takes it (HostState.takePick).
  const pick = useRef<NewMenuItem["pick"]>(undefined);
  const remount = (value: StorageBrowserValue) => {
    // A remount doesn't report its starting state, so record it ourselves;
    // Exit then reports the change back to no action.
    setCurrent(value);
    setMount((m) => ({ key: m.key + 1, defaultValue: value }));
  };
  // Opens one of the browser's action views for the current folder by remounting into it.
  const openAction = (item: NewMenuItem) => {
    pick.current = item.pick;
    remount({ location: current.location, actionType: item.actionType });
  };
  // Back to the folder's list. The remount also re-lists it, so a feature's changes show up.
  const exitToFolder = () => {
    pick.current = undefined;
    remount({ location: current.location });
  };
  // A sidebar location, at its top folder.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const openLocation = (target: LocationValue) => {
    pick.current = undefined;
    setDrawerOpen(false);
    remount({ location: target });
  };
  const locations = useMemo(() => driveLocations(bucket, email, access), [bucket, email, access]);

  const location: LocationValue = current.location ?? driveLocation(bucket, access);
  const policy = locationPolicy(access, email, location.prefix);
  const host: HostState = {
    email,
    access,
    location: current.location ? { prefix: location.prefix, path: location.path ?? "" } : null,
    actionType: current.actionType,
    policy,
    exitToFolder,
    takePick: (kind) => {
      if (pick.current !== kind) return false;
      pick.current = undefined;
      return true;
    },
  };

  // New's items write, so it's enabled only where the open location allows
  // writing; it's there (disabled elsewhere) when the person can write somewhere.
  const writable = !!current.location && policy.write;
  const showNew = composed.newMenu.length > 0 && (writable || canWriteSomewhere(email, access));
  // While an action's view is open, New and the sidebar wait: leaving the view
  // that way would drop its work (an import in progress).
  const busy = !!current.actionType;
  const notes = current.location && !current.actionType ? composed.notes(host) : [];
  // The element Storage Browser's search box is portalled into (TopBarSearch).
  const [searchSlot, setSearchSlot] = useState<HTMLElement | null>(null);
  // What the ⋮ menu offers, for the selection toolbar and the rows' menus.
  const actionsStore = useMemo(() => createActionsStore(composed.newMenu.map((i) => i.actionType)), [composed]);
  // How an opened file shows (viewer popup or info panel), shared by the list and the preview slot.
  const openFileStore = useMemo(() => createOpenFileStore(), []);
  const newMenu = (fab: boolean) =>
    showNew && (
      <NewMenu
        fab={fab}
        items={composed.newMenu}
        disabled={!writable || busy}
        disabledReason={busy ? "Close the open view first" : "You can't add files here"}
        onPick={openAction}
      />
    );

  return (
    <DriveHostContext.Provider value={host}>
      <TopBarSearchSlot.Provider value={searchSlot}>
      <ActionsStoreContext.Provider value={actionsStore}>
      <OpenFileContext.Provider value={openFileStore}>
      <div className="drive">
        <header className="topbar">
          <button
            type="button"
            className="icon-button topbar__menu"
            aria-label="Main menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((o) => !o)}
          >
            <Icon name="menu" />
          </button>
          <span className="brand">
            <img className="brand__logo" src="/icons/favicon-32.png" alt="" width={32} height={32} />
            <span className="brand__name">Family Drive</span>
          </span>
          <div className="topbar__search" ref={setSearchSlot} />
          <span className="spacer" />
          <AccountMenu email={email} onSignOut={signOutSafely} />
        </header>
        <div className="drive__body">
          <Sidebar
            newMenu={newMenu(false)}
            locations={locations}
            currentPrefix={current.location?.prefix ?? null}
            navigationDisabled={busy}
            onOpen={openLocation}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
          <main className="browser">
            {notes.map((note) => (
              <p key={note} className="folder-note" role="note">
                {note}
              </p>
            ))}
            <Browser
              key={mount.key}
              defaultValue={mount.defaultValue}
              views={views}
              onValueChange={onValueChange}
              displayText={displayText}
            />
          </main>
        </div>
        {newMenu(true)}
      </div>
      </OpenFileContext.Provider>
      </ActionsStoreContext.Provider>
      </TopBarSearchSlot.Provider>
    </DriveHostContext.Provider>
  );
}
