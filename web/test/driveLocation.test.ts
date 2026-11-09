import { describe, expect, it } from "vitest";
import { DRIVE_PREFIX, driveLocation, toAmplifyOutputs } from "../src/config";

describe("driveLocation", () => {
  it("points Storage Browser at the shared Global/ prefix with full permissions", () => {
    expect(driveLocation("family-drive-files-123")).toEqual({
      bucket: "family-drive-files-123",
      prefix: "Global/",
      type: "PREFIX",
      permissions: ["delete", "get", "list", "write"],
    });
  });

  it("uses the same prefix as the Amplify storage path", () => {
    const outputs = toAmplifyOutputs(
      {
        region: "ap-southeast-1",
        userPoolId: "p",
        userPoolClientId: "c",
        cognitoDomain: "d",
        identityPoolId: "i",
        filesBucket: "b",
        appUrl: "https://x",
      },
      "https://x",
    );
    expect(Object.keys(outputs.storage.buckets[0].paths)).toEqual([`${DRIVE_PREFIX}*`]);
  });
});
