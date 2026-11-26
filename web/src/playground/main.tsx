import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Amplify } from "aws-amplify";
import "../styles.css";
import Playground from "./Playground";
import Landing from "../pages/Landing";
import AccessDenied from "../pages/AccessDenied";
import { DriveView } from "../driveHost/DriveView";
import { driveFeatures } from "../features";
import { MOCK_BUCKET, MOCK_EMAIL, installS3FetchStub, mockAccess, mockSetup, mockStorage } from "./mockDrive";
import { mockGoogleImport } from "./mockGoogleImport";

// Dev-only playground entry. ?view=drive renders the real drive screen with
// sample data; &access=read (or read+personal, write, write+personal+trash) previews
// another access level, &count=fail makes the pager's folder count fail.
const params = new URLSearchParams(location.search);
const driveView = params.get("view") === "drive";
const access = mockAccess(params.get("access"));
// One in-memory drive behind the file list, the previews and every feature.
const { memory, storage } = mockStorage(params.get("count"));
const setup = mockSetup(access, memory);
const googleImport = mockGoogleImport(params.get("google") !== "off", storage);
const features = driveFeatures({ email: MOCK_EMAIL, access, storage, googleImport, deletedRetentionDays: 30 });
if (driveView) {
  installS3FetchStub(memory);
  // Previews call Amplify Storage (HeadObject, presigned URLs), which needs a bucket and region.
  Amplify.configure({ Storage: { S3: { bucket: MOCK_BUCKET, region: "ap-southeast-1" } } });
}

// ?view=landing and ?view=denied preview the sign-in and access-denied pages (their buttons do nothing here).
const page = params.get("view");
const noop = () => {};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {driveView ? (
      <DriveView email={MOCK_EMAIL} access={access} bucket={MOCK_BUCKET} setup={setup} features={features} />
    ) : page === "landing" ? (
      <Landing onSignIn={noop} />
    ) : page === "denied" ? (
      <AccessDenied onSignOut={noop} />
    ) : (
      <Playground />
    )}
  </StrictMode>,
);
