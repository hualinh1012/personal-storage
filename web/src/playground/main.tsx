import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Amplify } from "aws-amplify";
import "../styles.css";
import Playground from "./Playground";
import { DriveView } from "../pages/Drive";
import { MOCK_BUCKET, installS3FetchStub, mockSetup } from "./mockDrive";

// Dev-only playground entry. ?view=drive renders the real drive screen with sample data.
const driveView = new URLSearchParams(location.search).get("view") === "drive";
if (driveView) {
  installS3FetchStub();
  // Previews call Amplify Storage (HeadObject, presigned URLs), which needs a bucket and region.
  Amplify.configure({ Storage: { S3: { bucket: MOCK_BUCKET, region: "ap-southeast-1" } } });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {driveView ? <DriveView email="you@example.com" bucket={MOCK_BUCKET} setup={mockSetup} /> : <Playground />}
  </StrictMode>,
);
