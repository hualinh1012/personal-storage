import { useMemo } from "react";
import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import { createAmplifyAuthAdapter } from "@aws-amplify/ui-react-storage/browser";
import type { Access } from "../access";
import type { GoogleImportConfig } from "../config";
import { DriveView } from "../driveHost/DriveView";
import { driveFeatures } from "../features";
import { realGoogleImportDeps } from "../googleImport/deps";
import { listDriveLocations } from "../locationPolicy";
import { s3DriveStorage } from "../storage/s3Storage";

/**
 * The drive page in the app: the real bucket and Google, wired into the drive
 * host. The playground builds the same DriveView with sample data instead.
 */
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
  const features = useMemo(() => {
    const storage = s3DriveStorage({
      bucket,
      region: Amplify.getConfig().Storage?.S3?.region ?? "",
      // The SDK asks for credentials per request, so Amplify refreshes them as they expire.
      credentials: async () => {
        const { credentials } = await fetchAuthSession();
        if (!credentials) throw new Error("Not signed in.");
        return credentials;
      },
    });
    const googleImport = realGoogleImportDeps(google, storage);
    return driveFeatures({ email, access, storage, googleImport, deletedRetentionDays });
  }, [bucket, google, email, access, deletedRetentionDays]);
  return <DriveView email={email} access={access} bucket={bucket} setup={setup} features={features} />;
}
