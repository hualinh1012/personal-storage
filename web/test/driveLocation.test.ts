import { describe, expect, it } from "vitest";
import { READ_ONLY } from "../src/access";
import {
  DRIVE_PREFIX,
  canWrite,
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

const FULL = { globalWrite: true, personal: true };

describe("listDriveLocations", () => {
  it("lists the shared drive and only the signed-in person's folder", async () => {
    const { items, nextToken } = await listDriveLocations("b", "a@x.com", FULL)();
    expect(items.map((i) => [i.id, i.prefix])).toEqual([
      ["Global", "Global/"],
      ["Personal", "Personal/a@x.com/"],
    ]);
    expect(nextToken).toBeUndefined();
  });

  it("lists only the shared drive when the email is unknown", async () => {
    const { items } = await listDriveLocations("b", "  ", FULL)();
    expect(items.map((i) => i.prefix)).toEqual(["Global/"]);
  });

  it("lists no personal folder for someone without one", async () => {
    const { items } = await listDriveLocations("b", "a@x.com", { globalWrite: true, personal: false })();
    expect(items.map((i) => i.prefix)).toEqual(["Global/"]);
  });

  it("lists a writable personal folder next to a read-only Global/", async () => {
    const { items } = await listDriveLocations("b", "c@x.com", { globalWrite: false, personal: true })();
    expect(items.map((i) => [i.prefix, i.permissions])).toEqual([
      ["Global/", ["get", "list"]],
      ["Personal/c@x.com/", ["delete", "get", "list", "write"]],
    ]);
  });
});

describe("driveLocation", () => {
  it("points Storage Browser at the shared Global/ prefix with full permissions for writers", () => {
    expect(driveLocation("family-drive-files-123", FULL)).toEqual({
      bucket: "family-drive-files-123",
      prefix: "Global/",
      type: "PREFIX",
      permissions: ["delete", "get", "list", "write"],
    });
  });

  it("is read-only (get, list) without write access", () => {
    expect(driveLocation("b", READ_ONLY).permissions).toEqual(["get", "list"]);
    expect(canWrite(driveLocation("b", READ_ONLY))).toBe(false);
    expect(canWrite(driveLocation("b", FULL))).toBe(true);
    expect(canWrite(undefined)).toBe(false);
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
