import { describe, expect, it } from "vitest";
import {
  DRIVE_PREFIX,
  driveLocation,
  isPersonalPrefix,
  listDriveLocations,
  personalLocation,
  personalPrefix,
  toAmplifyOutputs,
} from "../src/config";

describe("personal folder", () => {
  it("is keyed by the email, lower-cased and trimmed to match the IAM principal tag", () => {
    expect(personalPrefix("Linh.Hua@Example.com ")).toBe("Personal/linh.hua@example.com/");
  });

  it("is a full-access Storage Browser location", () => {
    expect(personalLocation("b", "a@x.com")).toEqual({
      bucket: "b",
      prefix: "Personal/a@x.com/",
      type: "PREFIX",
      permissions: ["delete", "get", "list", "write"],
    });
    expect(isPersonalPrefix("Personal/a@x.com/")).toBe(true);
  });
});

describe("listDriveLocations", () => {
  it("lists the shared drive and only the signed-in person's folder", async () => {
    const { items, nextToken } = await listDriveLocations("b", "a@x.com")();
    expect(items.map((i) => [i.id, i.prefix])).toEqual([
      ["Global", "Global/"],
      ["Personal", "Personal/a@x.com/"],
    ]);
    expect(nextToken).toBeUndefined();
  });

  it("lists only the shared drive when the email is unknown", async () => {
    const { items } = await listDriveLocations("b", "  ")();
    expect(items.map((i) => i.prefix)).toEqual(["Global/"]);
  });
});

describe("driveLocation", () => {
  it("points Storage Browser at the shared Global/ prefix with full permissions", () => {
    expect(driveLocation("family-drive-files-123")).toEqual({
      bucket: "family-drive-files-123",
      prefix: "Global/",
      type: "PREFIX",
      permissions: ["delete", "get", "list", "write"],
    });
  });

  it("keeps the shared drive at Global/ (personal folders are elsewhere)", () => {
    expect(isPersonalPrefix(DRIVE_PREFIX)).toBe(false);
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
