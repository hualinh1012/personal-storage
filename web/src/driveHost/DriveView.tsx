import { useMemo, useState } from "react";
import {
  type CreateStorageBrowserInput,
  type StorageBrowserEventValue,
  type StorageBrowserValue,
} from "@aws-amplify/ui-react-storage/browser";
import "@aws-amplify/ui-react-storage/styles.css";
import type { Access } from "../access";
import { canWriteSomewhere, driveLocation, locationPolicy } from "../locationPolicy";
import { signOutSafely } from "../session";
import { composeFeatures, type DriveFeature, type HostState, type ListHandler } from "./feature";
import { AccountMenu } from "./AccountMenu";
import { DriveHostContext } from "./hostContext";
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
 * action from the top bar or to leave a feature's view. Features never see
 * Storage Browser's typings or the remount; they get `BrowserParts` and
 * `useDriveHost()` (where the person is, and `exitToFolder`).
 *
 * Storage Browser stays uncontrolled: in controlled mode it only reports
 * changes to its internal state, so an action opened from outside (a top-bar
 * button) never reports its Exit and the view gets stuck. Instead the host
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
  const { Browser, views } = useMemo(() => {
    const list = setup.listLocationItems ?? storageBrowserListHandler;
    const hosted = createBrowser({
      config: setup.config,
      actions: {
        default: { ...composed.defaultActions, listLocationItems: composed.wrapList(list) },
        custom: composed.customActions,
      },
      filePreview: composed.filePreview,
      // The host's own look (the top bar's search) under the features' slots.
      components: { SearchField: TopBarSearch, ...composed.components },
    });
    return { Browser: hosted.Browser, views: composed.views(hosted.parts) };
  }, [composed, setup, createBrowser]);

  const home = () => ({ location: driveLocation(bucket, access) });
  const [current, setCurrent] = useState<StorageBrowserValue>(home);
  const [mount, setMount] = useState<{ key: number; defaultValue: StorageBrowserValue }>(() => ({ key: 0, defaultValue: home() }));
  const onValueChange = (next: StorageBrowserEventValue) => setCurrent({ actionType: next.actionType, location: next.location });
  // Opens one of the browser's action views for the current folder by remounting into it.
  const openAction = (actionType: string) => {
    // A remount doesn't report its starting state, so record it ourselves;
    // Exit then reports the change back to no action.
    setCurrent((c) => ({ ...c, actionType }));
    setMount((m) => ({ key: m.key + 1, defaultValue: { location: current.location, actionType } }));
  };
  // Back to the folder's list. The remount also re-lists it, so a feature's changes show up.
  const exitToFolder = () => {
    setCurrent((c) => ({ location: c.location }));
    setMount((m) => ({ key: m.key + 1, defaultValue: { location: current.location } }));
  };

  const location: LocationValue = current.location ?? driveLocation(bucket, access);
  const policy = locationPolicy(access, email, location.prefix);
  const host: HostState = {
    email,
    access,
    location: current.location ? { prefix: location.prefix, path: location.path ?? "" } : null,
    actionType: current.actionType,
    policy,
    exitToFolder,
  };

  // Top-bar actions write, so they show only where the open location allows
  // writing; Home (no location) shows them disabled when the person can write somewhere.
  const writable = !!current.location && policy.write;
  const showTopBar = current.location ? writable : canWriteSomewhere(email, access);
  // While one of them is open, the others wait.
  const busy = composed.topBar.some((b) => b.actionType === current.actionType);
  const notes = current.location && !current.actionType ? composed.notes(host) : [];
  // The element Storage Browser's search box is portalled into (TopBarSearch).
  const [searchSlot, setSearchSlot] = useState<HTMLElement | null>(null);

  return (
    <DriveHostContext.Provider value={host}>
      <TopBarSearchSlot.Provider value={searchSlot}>
      <div className="drive">
        <header className="topbar">
          <span className="brand">
            <img className="brand__logo" src="/icons/favicon-32.png" alt="" width={32} height={32} />
            <span className="brand__name">Family Drive</span>
          </span>
          <div className="topbar__search" ref={setSearchSlot} />
          {showTopBar &&
            composed.topBar.map((b) => (
              <button
                key={b.actionType}
                type="button"
                className={b.primary ? "primary" : "outlined"}
                disabled={!writable || busy}
                onClick={() => openAction(b.actionType)}
              >
                {b.label}
              </button>
            ))}
          <span className="spacer" />
          <AccountMenu email={email} onSignOut={signOutSafely} />
        </header>
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
            displayText={composed.displayText}
          />
        </main>
      </div>
      </TopBarSearchSlot.Provider>
    </DriveHostContext.Provider>
  );
}
