/**
 * The S3 adapter's own plumbing with a fake SDK: which commands it sends, how
 * it pages, uploads in parts and maps errors. The behaviour both adapters share
 * is the contract suite (driveStorageContract.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Sent = { command: string; input: Record<string, unknown> };
const sent: Sent[] = [];
let respond: (s: Sent) => unknown = () => ({});

vi.mock("@aws-sdk/client-s3", () => {
  const command = (name: string) =>
    class {
      readonly command = name;
      constructor(readonly input: Record<string, unknown>) {}
    };
  return {
    S3Client: class {
      async send(c: { command: string; input: Record<string, unknown> }) {
        const s = { command: c.command, input: c.input };
        sent.push(s);
        const out = respond(s);
        if (out instanceof Error || (out as { $metadata?: unknown })?.$metadata) throw out;
        return out;
      }
    },
    ...Object.fromEntries(
      [
        "HeadObjectCommand",
        "CopyObjectCommand",
        "DeleteObjectCommand",
        "ListObjectsV2Command",
        "ListObjectVersionsCommand",
        "GetObjectCommand",
        "PutObjectCommand",
        "CreateMultipartUploadCommand",
        "UploadPartCommand",
        "CompleteMultipartUploadCommand",
        "AbortMultipartUploadCommand",
      ].map((n) => [n, command(n.replace(/Command$/, ""))]),
    ),
  };
});

const { s3DriveStorage, PART_SIZE } = await import("../src/storage/s3Storage");
const { isNotFound } = await import("../src/storage/driveStorage");

const storage = () => s3DriveStorage({ bucket: "files", region: "ap-southeast-1", credentials: async () => ({ accessKeyId: "a", secretAccessKey: "b" }) });
const names = () => sent.map((s) => s.command);

beforeEach(() => {
  sent.length = 0;
  respond = () => ({});
});

describe("s3DriveStorage", () => {
  it("answers exists with HeadObject: 404 is false, 403 is an AccessDenied error", async () => {
    respond = () => ({ name: "NotFound", message: "UnknownError", $metadata: { httpStatusCode: 404 } });
    expect(await storage().exists("Global/a.jpg")).toBe(false);
    respond = () => ({ name: "Forbidden", message: "UnknownError", $metadata: { httpStatusCode: 403 } });
    await expect(storage().exists("Global/a.jpg")).rejects.toMatchObject({ kind: "AccessDenied", message: "Access Denied" });
    expect(sent[0]).toEqual({ command: "HeadObject", input: { Bucket: "files", Key: "Global/a.jpg" } });
  });

  it("copies with an encoded CopySource", async () => {
    await storage().copy("Global/Tết/a b.jpg", "Deleted/Global/Tết/a b.jpg");
    expect(sent[0]).toEqual({
      command: "CopyObject",
      input: { Bucket: "files", Key: "Deleted/Global/Tết/a b.jpg", CopySource: "files/Global/T%E1%BA%BFt/a%20b.jpg" },
    });
  });

  it("lists one folder level across pages with the / delimiter", async () => {
    respond = ({ input }) =>
      input.ContinuationToken
        ? { Contents: [{ Key: "Global/b.jpg", Size: 2 }], CommonPrefixes: [{ Prefix: "Global/y/" }] }
        : { Contents: [{ Key: "Global/a.jpg", Size: 1 }], CommonPrefixes: [{ Prefix: "Global/x/" }], IsTruncated: true, NextContinuationToken: "t" };
    const listing = await storage().listFolder("Global/");
    expect(listing.files.map((f) => [f.key, f.size])).toEqual([
      ["Global/a.jpg", 1],
      ["Global/b.jpg", 2],
    ]);
    expect(listing.folders).toEqual(["Global/x/", "Global/y/"]);
    expect(sent.map((s) => s.input.Delimiter)).toEqual(["/", "/"]);
  });

  it("lists versions and delete markers across pages", async () => {
    respond = ({ input }) =>
      input.KeyMarker
        ? { DeleteMarkers: [{ Key: "Deleted/b", VersionId: "m1" }] }
        : { Versions: [{ Key: "Deleted/a", VersionId: "v1" }], IsTruncated: true, NextKeyMarker: "Deleted/a", NextVersionIdMarker: "v1" };
    expect(await storage().listVersions("Deleted/")).toEqual([
      { key: "Deleted/a", versionId: "v1" },
      { key: "Deleted/b", versionId: "m1" },
    ]);
  });

  it("maps a missing key on read to the one not-found rule", async () => {
    respond = () => Object.assign(new Error("The specified key does not exist."), { name: "NoSuchKey" });
    expect(isNotFound(await storage().read("Global/x.txt").catch((e: unknown) => e))).toBe(true);
  });

  it("writes a small file with one PutObject", async () => {
    await storage().write("Global/a.txt", new TextEncoder().encode("hi"), { contentType: "text/plain" });
    expect(names()).toEqual(["PutObject"]);
    expect(sent[0].input).toMatchObject({ Bucket: "files", Key: "Global/a.txt", ContentType: "text/plain" });
  });

  it("uploads a big file in parts and completes it", async () => {
    respond = ({ command, input }) =>
      command === "CreateMultipartUpload" ? { UploadId: "u1" } : command === "UploadPart" ? { ETag: `"e${input.PartNumber}"` } : {};
    await storage().write("Global/video.mp4", new Blob([new Uint8Array(PART_SIZE * 2 + 5)]), { contentType: "video/mp4" });
    expect(names()).toEqual(["CreateMultipartUpload", "UploadPart", "UploadPart", "UploadPart", "CompleteMultipartUpload"]);
    expect((sent[3].input.Body as Uint8Array).byteLength).toBe(5);
    expect(sent[4].input.MultipartUpload).toEqual({
      Parts: [
        { ETag: '"e1"', PartNumber: 1 },
        { ETag: '"e2"', PartNumber: 2 },
        { ETag: '"e3"', PartNumber: 3 },
      ],
    });
  });

  it("aborts the multipart upload when a part fails, and reports the reason", async () => {
    respond = ({ command }) =>
      command === "CreateMultipartUpload"
        ? { UploadId: "u1" }
        : command === "UploadPart"
          ? Object.assign(new Error("Please reduce your request rate."), { name: "SlowDown" })
          : {};
    await expect(storage().write("Global/v.mp4", new Blob([new Uint8Array(PART_SIZE + 1)]), { contentType: "video/mp4" })).rejects.toMatchObject({
      kind: "Other",
      message: "Please reduce your request rate.",
    });
    expect(names()).toEqual(["CreateMultipartUpload", "UploadPart", "AbortMultipartUpload"]);
  });

  it("sends nothing when the upload is already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(storage().write("Global/a.txt", new Uint8Array(1), { contentType: "text/plain", signal: controller.signal })).rejects.toMatchObject({
      kind: "Aborted",
    });
    expect(sent).toEqual([]);
  });
});
