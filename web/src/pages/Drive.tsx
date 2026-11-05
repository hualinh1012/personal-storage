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

type StorageBrowserSetup = Pick<CreateStorageBrowserInput, "config" | "actions">;

/**
 * The drive screen. Takes the Storage Browser setup so the dev playground can
 * render the exact same layout with sample data instead of AWS.
 */
export function DriveView({ email, bucket, setup }: { email: string; bucket: string; setup: StorageBrowserSetup }) {
  const { StorageBrowser, views } = useMemo(() => {
    const created = createStorageBrowser({
      ...setup,
      actions: { ...setup.actions, custom: { ...setup.actions?.custom, move: moveActionConfig as never } },
      filePreview: filePreviewConfig,
    });
    const MoveView = makeMoveView({
      CopyView: created.StorageBrowser.CopyView as unknown as MoveViewDeps["CopyView"],
      useView: created.useView as unknown as MoveViewDeps["useView"],
      useAction: created.useAction as unknown as MoveViewDeps["useAction"],
    });
    return { StorageBrowser: created.StorageBrowser, views: { MoveView } };
  }, [setup]);

  // Storage Browser stays uncontrolled: in controlled mode it only reports
  // changes to its internal state, so an action opened from outside (our
  // Upload button) never reports its Exit and the view gets stuck. Instead we
  // track where the user is from onValueChange, and the Upload button remounts
  // the browser straight into its own upload view for that folder.
  const [current, setCurrent] = useState<StorageBrowserValue>(() => ({ location: driveLocation(bucket) }));
  const [mount, setMount] = useState<{ key: number; defaultValue: StorageBrowserValue }>(() => ({
    key: 0,
    defaultValue: { location: driveLocation(bucket) },
  }));
  const onValueChange = (next: StorageBrowserEventValue) =>
    setCurrent({ actionType: next.actionType, location: next.location });
  const uploading = current.actionType === "upload";
  const openUpload = () => {
    // A remount doesn't report its starting state, so record it ourselves;
    // Exit then reports the change back to no action.
    setCurrent((c) => ({ ...c, actionType: "upload" }));
    setMount((m) => ({ key: m.key + 1, defaultValue: { location: current.location, actionType: "upload" } }));
  };

  return (
    <div className="drive">
      <header className="topbar">
        <strong>Family Drive</strong>
        <button
          type="button"
          className="primary"
          disabled={!current.location || uploading}
          onClick={openUpload}
        >
          Upload
        </button>
        <span className="spacer" />
        <span>{email}</span>
        <button className="link" onClick={signOutSafely}>
          Sign out
        </button>
      </header>
      <main className="browser">
        <StorageBrowser
          key={mount.key}
          defaultValue={mount.defaultValue}
          views={views as never}
          onValueChange={onValueChange}
          displayText={previewDisplayText}
        />
      </main>
    </div>
  );
}

export default function Drive({ email }: { email: string }) {
  // Created after App has run Amplify.configure: the adapter reads the storage
  // config when it's built, so this can't live at module level.
  const { setup, bucket } = useMemo(
    () => ({
      setup: { config: createAmplifyAuthAdapter() },
      bucket: Amplify.getConfig().Storage?.S3?.bucket ?? "",
    }),
    [],
  );
  return <DriveView email={email} bucket={bucket} setup={setup} />;
}
