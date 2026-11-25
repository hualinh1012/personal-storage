/**
 * The drive-storage contract (issue #39): what every adapter must do. Runs
 * against the in-memory adapter on every `npm test` (driveStorage.test.ts) and
 * against a real, versioned bucket when one is configured
 * (driveStorage.s3.test.ts). Every test works under its own fresh prefix.
 */
import { describe, expect, it } from "vitest";
import { DriveStorageError, isNotFound, type DriveStorage } from "../src/storage/driveStorage";

const text = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);

export function driveStorageContract(name: string, make: () => { storage: DriveStorage; prefix: string }) {
  describe(`DriveStorage contract: ${name}`, () => {
    const setup = () => {
      const { storage, prefix } = make();
      const put = (key: string, body = key) => storage.write(prefix + key, text(body), { contentType: "text/plain" });
      return { s: storage, p: prefix, put };
    };

    it("writes, reads back and reports existence", async () => {
      const { s, p, put } = setup();
      expect(await s.exists(`${p}a.txt`)).toBe(false);
      await put("a.txt", "hello");
      expect(await s.exists(`${p}a.txt`)).toBe(true);
      expect(str(await s.read(`${p}a.txt`))).toBe("hello");
    });

    it("writes a Blob as well as bytes, and a write replaces the file", async () => {
      const { s, p, put } = setup();
      await s.write(`${p}b.txt`, new Blob(["from a blob"]), { contentType: "text/plain" });
      expect(str(await s.read(`${p}b.txt`))).toBe("from a blob");
      await put("b.txt", "replaced");
      expect(str(await s.read(`${p}b.txt`))).toBe("replaced");
    });

    it("throws a NotFound DriveStorageError reading a missing key (the one not-found rule)", async () => {
      const { s, p } = setup();
      const error = await s.read(`${p}missing.txt`).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DriveStorageError);
      expect(isNotFound(error)).toBe(true);
    });

    it("copies, leaving the source in place, and fails with NotFound for a missing source", async () => {
      const { s, p, put } = setup();
      await put("src/file one.txt", "copy me");
      await s.copy(`${p}src/file one.txt`, `${p}dst/file one.txt`);
      expect(str(await s.read(`${p}dst/file one.txt`))).toBe("copy me");
      expect(await s.exists(`${p}src/file one.txt`)).toBe(true);
      expect(isNotFound(await s.copy(`${p}nope.txt`, `${p}x.txt`).catch((e: unknown) => e))).toBe(true);
    });

    it("copies keys with spaces, unicode and + (CopySource encoding)", async () => {
      const { s, p, put } = setup();
      await put("Tết 2026/a+b & c.txt", "x");
      await s.copy(`${p}Tết 2026/a+b & c.txt`, `${p}out/a+b & c.txt`);
      expect(await s.exists(`${p}out/a+b & c.txt`)).toBe(true);
    });

    it("removes a file; removing a missing key is fine", async () => {
      const { s, p, put } = setup();
      await put("gone.txt");
      await s.remove(`${p}gone.txt`);
      expect(await s.exists(`${p}gone.txt`)).toBe(false);
      await expect(s.remove(`${p}never-there.txt`)).resolves.toBeUndefined();
    });

    it("lists every key under a prefix at any depth, including folder placeholders", async () => {
      const { s, p, put } = setup();
      await put("f/a.txt");
      await put("f/sub/b.txt");
      await put("f/empty/", "");
      await put("other.txt");
      expect((await s.listKeys(`${p}f/`)).sort()).toEqual([`${p}f/a.txt`, `${p}f/empty/`, `${p}f/sub/b.txt`]);
    });

    it("lists one level of a folder: files (with sizes) and subfolders", async () => {
      const { s, p, put } = setup();
      await put("f/", "");
      await put("f/a.txt", "four");
      await put("f/sub/b.txt");
      await put("f/sub/c.txt");
      await put("f/empty/", "");
      const listing = await s.listFolder(`${p}f/`);
      expect(listing.files.map((f) => [f.key, f.size]).sort()).toEqual([
        [`${p}f/`, 0],
        [`${p}f/a.txt`, 4],
      ]);
      expect(listing.folders.sort()).toEqual([`${p}f/empty/`, `${p}f/sub/`]);
    });

    it("keeps versions: a removed file leaves its versions and a delete marker", async () => {
      const { s, p, put } = setup();
      await put("v.txt", "one");
      await put("v.txt", "two");
      await s.remove(`${p}v.txt`);
      const versions = await s.listVersions(`${p}v.txt`);
      expect(versions.filter((v) => v.key === `${p}v.txt`)).toHaveLength(3);
    });

    it("removing every version leaves nothing, not even in the versions list", async () => {
      const { s, p, put } = setup();
      await put("purge/a.txt", "one");
      await put("purge/a.txt", "two");
      await put("purge/b.txt");
      await s.remove(`${p}purge/b.txt`);
      for (const v of await s.listVersions(`${p}purge/`)) await s.removeVersion(v);
      expect(await s.listVersions(`${p}purge/`)).toEqual([]);
      expect(await s.listKeys(`${p}purge/`)).toEqual([]);
    });

    it("rejects a write whose signal is already aborted, and writes nothing", async () => {
      const { s, p } = setup();
      const controller = new AbortController();
      controller.abort();
      const error = await s
        .write(`${p}aborted.txt`, text("x"), { contentType: "text/plain", signal: controller.signal })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DriveStorageError);
      expect((error as DriveStorageError).kind).toBe("Aborted");
      expect(await s.exists(`${p}aborted.txt`)).toBe(false);
    });
  });
}
