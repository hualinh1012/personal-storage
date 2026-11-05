import { describe, expect, it, vi } from "vitest";
import { moveFile, type MoveOps } from "../src/move/moveFile";

const item = { key: "drive/b/photo.jpg", sourceKey: "drive/a/photo.jpg" };

function ops(overrides: Partial<MoveOps> = {}) {
  const calls: string[] = [];
  const o: MoveOps = {
    exists: vi.fn(async (key: string) => {
      calls.push(`exists ${key}`);
      return false;
    }),
    copy: vi.fn(async (i) => {
      calls.push(`copy ${i.sourceKey} -> ${i.key}`);
    }),
    remove: vi.fn(async (key: string) => {
      calls.push(`remove ${key}`);
    }),
    ...overrides,
  };
  return { o, calls };
}

describe("moveFile", () => {
  it("checks the destination, copies, then deletes the original", async () => {
    const { o, calls } = ops();
    await expect(moveFile(item, o)).resolves.toEqual({ status: "COMPLETE" });
    expect(calls).toEqual(["exists drive/b/photo.jpg", "copy drive/a/photo.jpg -> drive/b/photo.jpg", "remove drive/a/photo.jpg"]);
  });

  it("refuses to overwrite a file with the same name at the destination", async () => {
    const { o } = ops({ exists: vi.fn(async () => true) });
    const result = await moveFile(item, o);
    expect(result).toEqual({ status: "FAILED", message: "A file with this name already exists in the destination." });
    expect(o.copy).not.toHaveBeenCalled();
    expect(o.remove).not.toHaveBeenCalled();
  });

  it("does nothing when the destination is the file's own folder", async () => {
    const { o } = ops();
    const result = await moveFile({ key: item.sourceKey, sourceKey: item.sourceKey }, o);
    expect(result).toEqual({ status: "FAILED", message: "It's already in this folder." });
    expect(o.exists).not.toHaveBeenCalled();
    expect(o.copy).not.toHaveBeenCalled();
  });

  it("never deletes the original when the copy fails", async () => {
    const { o } = ops({ copy: vi.fn(async () => Promise.reject(new Error("AccessDenied"))) });
    const result = await moveFile(item, o);
    expect(result).toEqual({ status: "FAILED", message: "Couldn't copy it (AccessDenied). The original wasn't touched." });
    expect(o.remove).not.toHaveBeenCalled();
  });

  it("reports when the copy worked but the original couldn't be deleted", async () => {
    const { o } = ops({ remove: vi.fn(async () => Promise.reject(new Error("Throttled"))) });
    const result = await moveFile(item, o);
    expect(result).toEqual({
      status: "FAILED",
      message: "Copied, but the original couldn't be deleted (Throttled), so it's now in both folders.",
    });
  });

  it("stops before copying if the destination can't be checked", async () => {
    const { o } = ops({ exists: vi.fn(async () => Promise.reject(new Error("Network"))) });
    const result = await moveFile(item, o);
    expect(result).toEqual({ status: "FAILED", message: "Couldn't check the destination (Network). Nothing was moved." });
    expect(o.copy).not.toHaveBeenCalled();
  });
});
