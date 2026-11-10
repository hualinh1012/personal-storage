import { describe, expect, it } from "vitest";
import { deletedKey, originalKey, randomTag } from "../src/trash/paths";
import {
  deletePermanently,
  emptyDeleted,
  moveToDeleted,
  restore,
  type Clock,
  type ObjectVersion,
  type TrashOps,
} from "../src/trash/trash";
import { canWriteFor, deleteCompleteMessage } from "../src/trash/actions";
import { copySource } from "../src/trash/s3Ops";
import { emptySummaryText, failureLines } from "../src/trash/TrashViews";

const NOW = new Date(2026, 10, 10, 14, 3, 12); // local time
const clock: Clock = { now: () => NOW, tag: () => "7f2c" };

describe("deletedKey / originalKey", () => {
  it("keeps the path and stamps the name before the extension", () => {
    expect(deletedKey("Global/photos/a.jpg", NOW, "7f2c")).toBe("Deleted/Global/photos/a (deleted 2026-11-10 14-03-12 7f2c).jpg");
    expect(deletedKey("Personal/a@x.com/notes", NOW, "abcd")).toBe("Deleted/Personal/a@x.com/notes (deleted 2026-11-10 14-03-12 abcd)");
    expect(deletedKey("Global/.env", NOW, "abcd")).toBe("Deleted/Global/.env (deleted 2026-11-10 14-03-12 abcd)");
  });

  it("round-trips, including names with several dots and spaces", () => {
    for (const key of ["Global/photos/a.jpg", "Global/Tết 2026/plan v2.final.md", "Personal/a@x.com/archive.tar.gz", "Global/.env", "Global/README"]) {
      expect(originalKey(deletedKey(key, NOW, randomTag()))).toBe(key);
    }
  });

  it("only knows the original of files Delete put in Deleted/", () => {
    expect(originalKey("Deleted/Global/photos/a.jpg")).toBeNull();
    expect(originalKey("Global/photos/a (deleted 2026-11-10 14-03-12 7f2c).jpg")).toBeNull();
    expect(originalKey("Deleted/Global/photos/")).toBeNull();
  });

  it("makes random tags of four lower-case letters or digits", () => {
    expect(randomTag()).toMatch(/^[0-9a-z]{4}$/);
  });
});

/** An in-memory bucket: current keys plus a version history, recording calls. */
function fakeOps(initial: string[], fail: Partial<Record<keyof TrashOps, (arg: unknown) => boolean>> = {}) {
  const current = new Set(initial);
  const versions: ObjectVersion[] = initial.map((key) => ({ key, versionId: "v1" }));
  const calls: string[] = [];
  const guard = (op: keyof TrashOps, arg: unknown) => {
    calls.push(`${op} ${JSON.stringify(arg)}`);
    if (fail[op]?.(arg)) throw new Error(`${op} denied`);
  };
  const ops: TrashOps = {
    async exists(key) {
      guard("exists", key);
      return current.has(key);
    },
    async copy(source, destination) {
      guard("copy", [source, destination]);
      if (!current.has(source)) throw new Error("NoSuchKey");
      current.add(destination);
      versions.push({ key: destination, versionId: `v${versions.length + 1}` });
    },
    async remove(key) {
      guard("remove", key);
      current.delete(key);
      versions.push({ key, versionId: `marker${versions.length + 1}` });
    },
    async listKeys(prefix) {
      guard("listKeys", prefix);
      return [...current].filter((k) => k.startsWith(prefix));
    },
    async listVersions(prefix) {
      guard("listVersions", prefix);
      return versions.filter((v) => v.key.startsWith(prefix));
    },
    async removeVersion(v) {
      guard("removeVersion", v);
      versions.splice(versions.findIndex((x) => x.key === v.key && x.versionId === v.versionId), 1);
      if (!versions.some((x) => x.key === v.key)) current.delete(v.key);
    },
  };
  return { ops, current, versions, calls };
}

const D = "Deleted/Global/photos/a (deleted 2026-11-10 14-03-12 7f2c).jpg";

describe("moveToDeleted", () => {
  it("copies a file into Deleted/, then removes the original", async () => {
    const { ops, current, calls } = fakeOps(["Global/photos/a.jpg"]);
    expect(await moveToDeleted("Global/photos/a.jpg", ops, clock)).toEqual({ status: "COMPLETE" });
    expect([...current]).toEqual([D]);
    expect(calls.map((c) => c.split(" ")[0])).toEqual(["copy", "remove"]);
  });

  it("leaves the original alone when the copy fails", async () => {
    const { ops, current } = fakeOps(["Global/photos/a.jpg"], { copy: () => true });
    const outcome = await moveToDeleted("Global/photos/a.jpg", ops, clock);
    expect(outcome).toEqual({ status: "FAILED", message: "Couldn't move it to Deleted (copy denied). The file wasn't touched." });
    expect([...current]).toEqual(["Global/photos/a.jpg"]);
  });

  it("says when the copy worked but the original couldn't be removed", async () => {
    const { ops, current } = fakeOps(["Global/photos/a.jpg"], { remove: () => true });
    const outcome = await moveToDeleted("Global/photos/a.jpg", ops, clock);
    expect(outcome.status).toBe("FAILED");
    expect(outcome.status === "FAILED" && outcome.message).toMatch(/in both places/);
    expect(current.has("Global/photos/a.jpg") && current.has(D)).toBe(true);
  });

  it("moves every file in a folder and drops the folder placeholders", async () => {
    const { ops, current } = fakeOps(["Global/photos/", "Global/photos/a.jpg", "Global/photos/2025/", "Global/photos/2025/b.jpg", "Global/other.txt"]);
    expect(await moveToDeleted("Global/photos/", ops, clock)).toEqual({ status: "COMPLETE" });
    expect([...current].sort()).toEqual([
      "Deleted/Global/photos/2025/b (deleted 2026-11-10 14-03-12 7f2c).jpg",
      D,
      "Global/other.txt",
    ]);
  });

  it("reports which files in a folder failed and keeps the placeholders", async () => {
    const { ops, current } = fakeOps(["Global/photos/", "Global/photos/a.jpg", "Global/photos/b.jpg"], {
      copy: (arg) => (arg as string[])[0].endsWith("b.jpg"),
    });
    const outcome = await moveToDeleted("Global/photos/", ops, clock);
    expect(outcome.status === "FAILED" && outcome.message).toMatch(/^1 of 2 files weren't moved to Deleted\. b\.jpg: Couldn't move it/);
    expect(current.has("Global/photos/")).toBe(true);
  });
});

const everywhere = () => true;

describe("restore", () => {
  it("puts the file back at its original key and removes every version from Deleted/", async () => {
    const { ops, current, versions } = fakeOps([D]);
    expect(await restore(D, ops, everywhere)).toEqual({ status: "COMPLETE" });
    expect([...current]).toEqual(["Global/photos/a.jpg"]);
    expect(versions.filter((v) => v.key.startsWith("Deleted/"))).toEqual([]);
  });

  it("never overwrites a file that's back at the original key", async () => {
    const { ops, current } = fakeOps([D, "Global/photos/a.jpg"]);
    const outcome = await restore(D, ops, everywhere);
    expect(outcome).toEqual({ status: "FAILED", message: "A file with this name is already at Global/photos/a.jpg." });
    expect(current.has(D)).toBe(true);
  });

  it("explains, without trying, when the person can't write to the original place", async () => {
    const personal = "Deleted/Personal/mom@x.com/tax (deleted 2026-11-10 14-03-12 7f2c).pdf";
    const { ops, calls } = fakeOps([personal, D]);
    expect(await restore(personal, ops, () => false)).toEqual({
      status: "FAILED",
      message: "It was in mom@x.com's personal folder, which only they can write to.",
    });
    expect(await restore(D, ops, () => false)).toEqual({
      status: "FAILED",
      message: "You can't add files to the shared drive, so you can't restore it there.",
    });
    expect(calls).toEqual([]);
  });

  it("refuses files whose original place is unknown", async () => {
    const { ops } = fakeOps(["Deleted/Global/stray.txt"]);
    expect(await restore("Deleted/Global/stray.txt", ops, everywhere)).toEqual({
      status: "FAILED",
      message: "Its original place is unknown (it wasn't put here by Delete).",
    });
  });

  it("keeps the deleted copy when the copy back fails", async () => {
    const { ops, current } = fakeOps([D], { copy: () => true });
    const outcome = await restore(D, ops, everywhere);
    expect(outcome.status === "FAILED" && outcome.message).toMatch(/It's still in Deleted\./);
    expect([...current]).toEqual([D]);
  });

  it("restores every file in a Deleted folder", async () => {
    const b = "Deleted/Global/photos/2025/b (deleted 2026-11-10 14-03-12 7f2c).jpg";
    const { ops, current } = fakeOps([D, b]);
    expect(await restore("Deleted/Global/photos/", ops, everywhere)).toEqual({ status: "COMPLETE" });
    expect([...current].sort()).toEqual(["Global/photos/2025/b.jpg", "Global/photos/a.jpg"]);
  });
});

describe("deletePermanently", () => {
  it("removes every version of the file, and no other file's", async () => {
    const other = "Deleted/Global/photos/a (deleted 2026-11-10 14-03-12 zzzz).jpg";
    const { ops, versions } = fakeOps([D, other]);
    versions.push({ key: D, versionId: "old" });
    expect(await deletePermanently(D, ops)).toEqual({ status: "COMPLETE" });
    expect(versions.map((v) => v.key)).toEqual([other]);
  });

  it("removes a whole folder in Deleted/ with every version", async () => {
    const { ops, versions } = fakeOps([D, "Deleted/Global/other.txt"]);
    expect(await deletePermanently("Deleted/Global/photos/", ops)).toEqual({ status: "COMPLETE" });
    expect(versions.map((v) => v.key)).toEqual(["Deleted/Global/other.txt"]);
  });

  it("refuses anything outside Deleted/", async () => {
    const { ops, calls } = fakeOps(["Global/photos/a.jpg"]);
    expect(await deletePermanently("Global/photos/a.jpg", ops)).toEqual({
      status: "FAILED",
      message: "Only files in Deleted can be deleted permanently.",
    });
    expect(calls).toEqual([]);
  });
});

describe("emptyDeleted", () => {
  it("removes every version under Deleted/ only, reporting progress", async () => {
    const { ops, versions } = fakeOps([D, "Deleted/Global/x.txt", "Global/keep.txt"]);
    const progress: string[] = [];
    const summary = await emptyDeleted(ops, (done, total) => progress.push(`${done}/${total}`));
    expect(summary).toEqual({ removed: 2, failed: 0 });
    expect(progress).toEqual(["1/2", "2/2"]);
    expect(versions.map((v) => v.key)).toEqual(["Global/keep.txt"]);
  });

  it("keeps going past failures and reports the first one", async () => {
    const { ops } = fakeOps([D, "Deleted/Global/x.txt"], { removeVersion: (v) => (v as ObjectVersion).key === D });
    const summary = await emptyDeleted(ops);
    expect(summary).toEqual({ removed: 1, failed: 1, firstError: "a (deleted 2026-11-10 14-03-12 7f2c).jpg: removeVersion denied" });
    expect(emptySummaryText(summary)).toMatch(/1 couldn't be removed/);
    expect(emptySummaryText({ removed: 0, failed: 0 })).toBe("Deleted was already empty.");
  });
});

describe("canWriteFor", () => {
  it("allows Global/ with write access and only the person's own personal folder", () => {
    const can = canWriteFor({ globalWrite: true, personal: true, trash: true }, "Me@x.com");
    expect(can("Global/a.jpg")).toBe(true);
    expect(can("Personal/me@x.com/a.jpg")).toBe(true);
    expect(can("Personal/mom@x.com/a.jpg")).toBe(false);
    const readOnly = canWriteFor({ globalWrite: false, personal: false, trash: true }, "me@x.com");
    expect(readOnly("Global/a.jpg")).toBe(false);
    expect(readOnly("Personal/me@x.com/a.jpg")).toBe(false);
  });
});

describe("messages", () => {
  it("puts failure reasons in Delete's completion message", () => {
    expect(deleteCompleteMessage({ counts: { COMPLETE: 2, FAILED: 0, TOTAL: 2 } })).toEqual({
      content: "2 items moved to Deleted.",
      type: "success",
    });
    expect(
      deleteCompleteMessage({
        counts: { COMPLETE: 1, FAILED: 1, TOTAL: 2 },
        tasks: [{ status: "FAILED", message: "Couldn't move it to Deleted (AccessDenied).", data: { key: "Global/photos/" } }],
      }).content,
    ).toBe("1 item moved to Deleted, 1 item not moved. photos: Couldn't move it to Deleted (AccessDenied).");
  });

  it("lists failed items with their reasons in Restore and Delete permanently", () => {
    expect(failureLines([{ status: "FAILED", message: "No.", data: { key: D } }, { status: "COMPLETE", data: { key: "x" } }])).toEqual([
      "a (deleted 2026-11-10 14-03-12 7f2c).jpg: No.",
    ]);
  });

  it("encodes the copy source per path segment", () => {
    expect(copySource("b", "Global/Tết 2026/a b.jpg")).toBe("b/Global/T%E1%BA%BFt%202026/a%20b.jpg");
  });
});
