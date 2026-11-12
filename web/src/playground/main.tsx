import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Amplify } from "aws-amplify";
import "../styles.css";
import Playground from "./Playground";
import { DriveView } from "../pages/Drive";
import { MOCK_BUCKET, MOCK_EMAIL, installS3FetchStub, mockAccess, mockCountFolder, mockSetup, mockTextFiles, mockTrash } from "./mockDrive";
import { mockGoogleImport } from "./mockGoogleImport";

// Dev-only playground entry. ?view=drive renders the real drive screen with
// sample data; &access=read (or read+personal, write, write+personal+trash) previews
// another access level, &count=fail makes the pager's folder count fail.
const params = new URLSearchParams(location.search);
const driveView = params.get("view") === "drive";
const access = mockAccess(params.get("access"));
const setup = mockSetup(access);
const googleImport = mockGoogleImport(params.get("google") !== "off");
const countFolder = mockCountFolder(params.get("count"));
const trash = mockTrash(access);
const textFiles = mockTextFiles();
if (driveView) {
  installS3FetchStub();
  // Previews call Amplify Storage (HeadObject, presigned URLs), which needs a bucket and region.
  Amplify.configure({ Storage: { S3: { bucket: MOCK_BUCKET, region: "ap-southeast-1" } } });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {driveView ? (
      <DriveView email={MOCK_EMAIL} access={access} bucket={MOCK_BUCKET} setup={setup} googleImport={googleImport} countFolder={countFolder} trash={trash} deletedRetentionDays={30} textFiles={textFiles} />
    ) : (
      <Playground />
    )}
  </StrictMode>,
);
