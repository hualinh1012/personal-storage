import { useMemo } from "react";
import { Amplify } from "aws-amplify";
import { signOutSafely } from "../session";
import {
  createAmplifyAuthAdapter,
  createStorageBrowser,
  type CreateStorageBrowserInput,
} from "@aws-amplify/ui-react-storage/browser";
import "@aws-amplify/ui-react-storage/styles.css";
import { driveLocation } from "../config";
import { filePreviewConfig, previewDisplayText } from "../preview/registry";

type StorageBrowserSetup = Pick<CreateStorageBrowserInput, "config" | "actions">;

/**
 * The drive screen. Takes the Storage Browser setup so the dev playground can
 * render the exact same layout with sample data instead of AWS.
 */
export function DriveView({ email, bucket, setup }: { email: string; bucket: string; setup: StorageBrowserSetup }) {
  const StorageBrowser = useMemo(
    () => createStorageBrowser({ ...setup, filePreview: filePreviewConfig }).StorageBrowser,
    [setup],
  );
  const location = useMemo(() => driveLocation(bucket), [bucket]);

  return (
    <div className="drive">
      <header className="topbar">
        <strong>Family Drive</strong>
        <span className="spacer" />
        <span>{email}</span>
        <button className="link" onClick={signOutSafely}>
          Sign out
        </button>
      </header>
      <main className="browser">
        <StorageBrowser defaultValue={{ location }} displayText={previewDisplayText} />
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
