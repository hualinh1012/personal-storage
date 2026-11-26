import { describe, expect, it } from "vitest";
import { READ_ONLY, type Access } from "../src/access";
import {
  canWriteAt,
  canWriteSomewhere,
  capabilitiesOf,
  driveLocation,
  hideUnless,
  listDriveLocations,
  locationPolicy,
  personalPrefix,
  type Capabilities,
  type LocationKind,
} from "../src/locationPolicy";

/*
 * Checked by hand against the `authenticated` policy in infra/identity.tf
 * (ADR 0010, 0009, 0011). Statement ids per location:
 * - Global/:             ListDriveFolder, ReadDriveObjects (everyone);
 *                        WriteDriveObjects (global_access = write).
 * - Personal/<email>/:   ListOwnPersonalFolder, ManageOwnPersonalObjects (personal = yes),
 *                        only for the caller's own `email` tag.
 * - Deleted/:            ListDeletedFolder, ManageDeletedObjects (trash = yes). Writers'
 *                        PutObject into Deleted/ (MoveSharedFilesToDeleted,
 *                        MoveOwnPersonalFilesToDeleted) is part of Delete elsewhere, not
 *                        a capability of the Deleted folder itself.
 * Change IAM there, change this table and src/locationPolicy.ts together.
 */

const ME = "Me@X.com";
const NONE: Access = READ_ONLY;
const WRITE: Access = { globalWrite: true, personal: false, trash: false };
const PERSONAL: Access = { globalWrite: false, personal: true, trash: false };
const TRASH: Access = { globalWrite: false, personal: false, trash: true };
const ALL: Access = { globalWrite: true, personal: true, trash: true };

// prettier-ignore
const C = {
  nothing:  { read: false, write: false, move: false, manageDeleted: false },
  read:     { read: true,  write: false, move: false, manageDeleted: false },
  full:     { read: true,  write: true,  move: true,  manageDeleted: false },
  deleted:  { read: true,  write: false, move: false, manageDeleted: true  },
} satisfies Record<string, Capabilities>;

// prettier-ignore
const table: [string, Access, string, LocationKind, Capabilities, string[]][] = [
  // who,       access,   prefix or key,                   kind,       capabilities, Storage Browser permissions
  ["read-only", NONE,     "Global/",                       "shared",   C.read,    ["get", "list"]],
  ["writer",    WRITE,    "Global/photos/a.jpg",           "shared",   C.full,    ["delete", "get", "list", "write"]],
  ["read-only", NONE,     "Personal/me@x.com/",            "personal", C.nothing, []],
  ["personal",  PERSONAL, "Personal/me@x.com/",            "personal", C.full,    ["delete", "get", "list", "write"]],
  ["personal",  PERSONAL, "Personal/me@x.com/tax/a.pdf",   "personal", C.full,    ["delete", "get", "list", "write"]],
  ["everyone",  ALL,      "Personal/mom@x.com/",           "other",    C.nothing, []],
  ["everyone",  ALL,      "Personal/me@x.com.evil/",       "other",    C.nothing, []],
  ["writer",    WRITE,    "Deleted/",                      "deleted",  C.nothing, []],
  ["trash",     TRASH,    "Deleted/",                      "deleted",  C.deleted, ["delete", "get", "list"]],
  ["everyone",  ALL,      "Deleted/Global/a (deleted).jpg","deleted",  C.deleted, ["delete", "get", "list"]],
  ["everyone",  ALL,      "",                              "other",    C.nothing, []],
  ["everyone",  ALL,      "Other/",                        "other",    C.nothing, []],
];

describe("locationPolicy", () => {
  it.each(table)("%s at %j is %s", (_who, access, prefix, kind, capabilities, permissions) => {
    expect(locationPolicy(access, ME, prefix)).toEqual({ kind, ...capabilities, permissions });
  });

  it.each(table)("%s at %j: actions' hide reads the same capabilities back", (_who, access, prefix) => {
    const policy = locationPolicy(access, ME, prefix);
    const { kind: _kind, permissions, ...capabilities } = policy;
    expect(capabilitiesOf(permissions)).toEqual(capabilities);
  });

  it("matches the personal folder by lower-cased, trimmed email, and never with no email", () => {
    expect(personalPrefix(" Linh.Hua@Example.com ")).toBe("Personal/linh.hua@example.com/");
    expect(locationPolicy(PERSONAL, "", "Personal//").kind).toBe("other");
    expect(locationPolicy(PERSONAL, "  ", "Personal/").write).toBe(false);
  });
});

describe("hideUnless", () => {
  it("hides each action where its capability is missing", () => {
    const at = (access: Access, prefix: string) => locationPolicy(access, ME, prefix).permissions;
    expect(hideUnless("write")(at(NONE, "Global/"))).toBe(true);
    expect(hideUnless("write")(at(WRITE, "Global/"))).toBe(false);
    expect(hideUnless("move")(at(PERSONAL, personalPrefix(ME)))).toBe(false);
    expect(hideUnless("move")(at(TRASH, "Deleted/"))).toBe(true);
    expect(hideUnless("manageDeleted")(at(TRASH, "Deleted/"))).toBe(false);
    expect(hideUnless("manageDeleted")(at(ALL, "Global/"))).toBe(true);
  });
});

describe("canWriteAt (Restore's check)", () => {
  it("allows Global/ with write access and only the person's own folder", () => {
    const can = canWriteAt(ALL, ME);
    expect(can("Global/a.jpg")).toBe(true);
    expect(can("Personal/me@x.com/a.jpg")).toBe(true);
    expect(can("Personal/mom@x.com/a.jpg")).toBe(false);
    expect(can("Deleted/Global/a.jpg")).toBe(false);
    const readOnly = canWriteAt(TRASH, ME);
    expect(readOnly("Global/a.jpg")).toBe(false);
    expect(readOnly("Personal/me@x.com/a.jpg")).toBe(false);
  });
});

describe("Storage Browser locations", () => {
  it("opens at the shared drive, read-only without write access", () => {
    expect(driveLocation("family-drive-files-123", WRITE)).toEqual({
      bucket: "family-drive-files-123",
      prefix: "Global/",
      type: "PREFIX",
      permissions: ["delete", "get", "list", "write"],
    });
    expect(driveLocation("b", NONE).permissions).toEqual(["get", "list"]);
  });

  const home = async (email: string, access: Access) => (await listDriveLocations("b", email, access)()).items;

  it("lists every readable location on Home, Deleted last", async () => {
    const { items, nextToken } = await listDriveLocations("b", ME, ALL)();
    expect(items.map((i) => [i.id, i.prefix, i.permissions])).toEqual([
      ["Global", "Global/", ["delete", "get", "list", "write"]],
      ["Personal", "Personal/me@x.com/", ["delete", "get", "list", "write"]],
      ["Deleted", "Deleted/", ["delete", "get", "list"]],
    ]);
    expect(items[0]).toMatchObject({ bucket: "b", type: "PREFIX" });
    expect(nextToken).toBeUndefined();
  });

  it("leaves out what the person can't open", async () => {
    expect((await home(ME, NONE)).map((i) => i.prefix)).toEqual(["Global/"]);
    expect((await home(ME, WRITE)).map((i) => i.prefix)).toEqual(["Global/"]);
    expect((await home("  ", ALL)).map((i) => i.prefix)).toEqual(["Global/", "Deleted/"]);
    expect((await home(ME, PERSONAL)).map((i) => [i.prefix, i.permissions])).toEqual([
      ["Global/", ["get", "list"]],
      ["Personal/me@x.com/", ["delete", "get", "list", "write"]],
    ]);
  });

  it("says whether \"+ New\" belongs on the drive screen", () => {
    expect(canWriteSomewhere(ME, NONE)).toBe(false);
    expect(canWriteSomewhere(ME, TRASH)).toBe(false);
    expect(canWriteSomewhere(ME, WRITE)).toBe(true);
    expect(canWriteSomewhere(ME, PERSONAL)).toBe(true);
    expect(canWriteSomewhere("", PERSONAL)).toBe(false);
  });
});
