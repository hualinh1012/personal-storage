import { describe, expect, it } from "vitest";
import { moveFile } from "../src/move/moveFile";
import { DriveStorageError, type DriveStorage } from "../src/storage/driveStorage";
import { memoryDriveStorage } from "../src/storage/memoryStorage";

const item = { key: "Global/b/photo.jpg", sourceKey: "Global/a/photo.jpg" };
const fail = (message: string) => async () => {
  throw new DriveStorageError("Other", message);
};

/** The in-memory drive with the photo in Global/a/, plus any failing operations. */
function drive(overrides: Partial<DriveStorage> = {}, extra: string[] = []) {
  const memory = memoryDriveStorage([item.sourceKey, ...extra].map((key) => ({ key, body: key })));
  return { memory, storage: { ...memory, ...overrides } };
}

describe("moveFile", () => {
  it("copies to the destination, then deletes the original", async () => {
    const { memory, storage } = drive();
    await expect(moveFile(item, storage)).resolves.toEqual({ status: "COMPLETE" });
    expect(memory.keys()).toEqual([item.key]);
    expect(new TextDecoder().decode(await memory.read(item.key))).toBe(item.sourceKey);
  });

  it("refuses to overwrite a file with the same name at the destination", async () => {
    const { memory, storage } = drive({}, [item.key]);
    const result = await moveFile(item, storage);
    expect(result).toEqual({ status: "FAILED", message: "A file with this name already exists in the destination." });
    expect(memory.keys().sort()).toEqual([item.sourceKey, item.key].sort());
    expect(new TextDecoder().decode(await memory.read(item.key))).toBe(item.key);
  });

  it("does nothing when the destination is the file's own folder", async () => {
    const { memory, storage } = drive({ exists: fail("should not be called") });
    const result = await moveFile({ key: item.sourceKey, sourceKey: item.sourceKey }, storage);
    expect(result).toEqual({ status: "FAILED", message: "It's already in this folder." });
    expect(memory.keys()).toEqual([item.sourceKey]);
  });

  it("never deletes the original when the copy fails", async () => {
    const { memory, storage } = drive({ copy: fail("Access Denied") });
    const result = await moveFile(item, storage);
    expect(result).toEqual({ status: "FAILED", message: "Couldn't copy it (Access Denied). The original wasn't touched." });
    expect(memory.keys()).toEqual([item.sourceKey]);
  });

  it("reports when the copy worked but the original couldn't be deleted", async () => {
    const { memory, storage } = drive({ remove: fail("Throttled") });
    const result = await moveFile(item, storage);
    expect(result).toEqual({
      status: "FAILED",
      message: "Copied, but the original couldn't be deleted (Throttled), so it's now in both folders.",
    });
    expect(memory.keys().sort()).toEqual([item.sourceKey, item.key].sort());
  });

  it("stops before copying if the destination can't be checked", async () => {
    const { memory, storage } = drive({ exists: fail("Network") });
    const result = await moveFile(item, storage);
    expect(result).toEqual({ status: "FAILED", message: "Couldn't check the destination (Network). Nothing was moved." });
    expect(memory.keys()).toEqual([item.sourceKey]);
  });

  it("explains a vanished original with the storage's not-found reason", async () => {
    const { storage } = drive();
    const result = await moveFile({ key: "Global/b/x.jpg", sourceKey: "Global/a/x.jpg" }, storage);
    expect(result).toEqual({ status: "FAILED", message: "Couldn't copy it (No such key: Global/a/x.jpg). The original wasn't touched." });
  });
});
