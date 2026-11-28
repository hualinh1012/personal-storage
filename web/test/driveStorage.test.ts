import { describe, expect, it } from "vitest";
import { memoryDriveStorage } from "../src/storage/memoryStorage";
import { copySource, toStorageError } from "../src/storage/s3Storage";
import { driveStorageContract } from "./driveStorageContract";

driveStorageContract("in-memory adapter", () => ({ storage: memoryDriveStorage(), prefix: "Global/contract/" }));

describe("in-memory adapter", () => {
  it("removing the latest version uncovers the one before, like S3", async () => {
    const s = memoryDriveStorage([{ key: "a.txt", body: "one" }]);
    await s.write("a.txt", new TextEncoder().encode("two"), { contentType: "text/plain" });
    const [latest] = await s.listVersions("a.txt");
    await s.removeVersion(latest);
    expect(new TextDecoder().decode(await s.read("a.txt"))).toBe("one");
  });

  it("seeds sample files, with listing-only entries that have no content", async () => {
    const s = memoryDriveStorage([{ key: "Global/big.mp4", size: 120_000_000, contentType: "video/mp4" }]);
    expect(s.get("Global/big.mp4")?.size).toBe(120_000_000);
    expect((await s.listFolder("Global/")).files).toHaveLength(1);
    await expect(s.read("Global/big.mp4")).rejects.toThrow(/no content/);
  });
});

describe("S3 adapter helpers", () => {
  it("builds CopySource with each key segment URL-encoded", () => {
    expect(copySource("b", "Global/Tết 2026/a+b & c.txt")).toBe("b/Global/T%E1%BA%BFt%202026/a%2Bb%20%26%20c.txt");
  });

  it("adds an encoded versionId to CopySource when copying a version", () => {
    expect(copySource("b", "Global/a b.txt", "3/L4kqtJl+cz")).toBe("b/Global/a%20b.txt?versionId=3%2FL4kqtJl%2Bcz");
  });

  it("maps SDK errors to one error type, keeping S3's wording", () => {
    const head404 = toStorageError({ name: "NotFound", message: "UnknownError", $metadata: { httpStatusCode: 404 } });
    expect([head404.kind, head404.message]).toEqual(["NotFound", "Not Found"]);
    expect(toStorageError({ name: "NoSuchKey", message: "The specified key does not exist." }).kind).toBe("NotFound");
    expect(toStorageError({ name: "NoSuchVersion", message: "The specified version does not exist." }).kind).toBe("NotFound");
    const denied = toStorageError({ name: "AccessDenied", message: "Access Denied", $metadata: { httpStatusCode: 403 } });
    expect([denied.kind, denied.message]).toEqual(["AccessDenied", "Access Denied"]);
    expect(toStorageError({ name: "Forbidden", message: "UnknownError", $metadata: { httpStatusCode: 403 } }).message).toBe("Access Denied");
    expect(toStorageError(new DOMException("The operation was aborted.", "AbortError")).kind).toBe("Aborted");
    expect(toStorageError({ name: "SlowDown", message: "Please reduce your request rate." })).toMatchObject({
      kind: "Other",
      message: "Please reduce your request rate.",
    });
  });
});
