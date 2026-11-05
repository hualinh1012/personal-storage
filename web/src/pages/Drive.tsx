import { useMemo } from "react";
import { Amplify } from "aws-amplify";
import { signOutSafely } from "../session";
import { createAmplifyAuthAdapter, createStorageBrowser } from "@aws-amplify/ui-react-storage/browser";
import "@aws-amplify/ui-react-storage/styles.css";
import { driveLocation } from "../config";
import { filePreviewConfig, previewDisplayText } from "../preview/registry";

export default function Drive({ email }: { email: string }) {
  // Created after App has run Amplify.configure: the adapter reads the storage
  // config when it's built, so this can't live at module level.
  const { StorageBrowser, location } = useMemo(() => {
    const bucket = Amplify.getConfig().Storage?.S3?.bucket ?? "";
    return {
      StorageBrowser: createStorageBrowser({
        config: createAmplifyAuthAdapter(),
        filePreview: filePreviewConfig,
      }).StorageBrowser,
      location: driveLocation(bucket),
    };
  }, []);

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
