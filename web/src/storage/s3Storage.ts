/**
 * The drive-storage S3 adapter: the files bucket, as the signed-in person
 * (Identity Pool credentials, so IAM decides what they may do). Uses the AWS
 * SDK for everything (owner's decision on #39): one client, one credential
 * path, one error type. The SDK is loaded on the first call, so it stays out of
 * the main bundle.
 */
import type { S3Client } from "@aws-sdk/client-s3";
import { DriveStorageError, type DriveStorage, type ObjectVersion, type StoredFile } from "./driveStorage";

export interface S3Target {
  bucket: string;
  region: string;
  /** Asked before each request, so expiring credentials are refreshed. */
  credentials: () => Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string; expiration?: Date }>;
}

/** Files up to this size go up in one PutObject; bigger ones in parts of this size. */
export const PART_SIZE = 8 * 1024 * 1024;

/** CopySource is "bucket/key" with the key URL-encoded segment by segment, and "?versionId=" to copy a version. */
export function copySource(bucket: string, key: string, versionId?: string): string {
  const source = `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  return versionId === undefined ? source : `${source}?versionId=${encodeURIComponent(versionId)}`;
}

type SdkError = { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };

/** Turns whatever the SDK threw into a DriveStorageError, keeping S3's wording as the reason. */
export function toStorageError(error: unknown): DriveStorageError {
  if (error instanceof DriveStorageError) return error;
  const e = (error ?? {}) as SdkError;
  const status = e.$metadata?.httpStatusCode;
  // HEAD responses have no body, so the SDK has only the status to go on ("UnknownError").
  const message = e.message && e.message !== "UnknownError" ? e.message : undefined;
  if (e.name === "AbortError") return new DriveStorageError("Aborted", message ?? "Cancelled", { cause: error });
  if (e.name === "NotFound" || e.name === "NoSuchKey" || e.name === "NoSuchVersion" || status === 404) {
    return new DriveStorageError("NotFound", message ?? "Not Found", { cause: error });
  }
  if (e.name === "AccessDenied" || e.name === "Forbidden" || status === 403) {
    return new DriveStorageError("AccessDenied", message ?? "Access Denied", { cause: error });
  }
  return new DriveStorageError("Other", message ?? e.name ?? String(error), { cause: error });
}

const bytes = async (body: Blob | Uint8Array) => (body instanceof Uint8Array ? body : new Uint8Array(await body.arrayBuffer()));

export function s3DriveStorage({ bucket, region, credentials }: S3Target): DriveStorage {
  const Bucket = bucket;
  let loaded: Promise<{ s3: typeof import("@aws-sdk/client-s3"); client: S3Client }> | undefined;
  // Loads the SDK once; a failed load is retried on the next call.
  const sdk = () =>
    (loaded ??= import("@aws-sdk/client-s3").then(
      (s3) => ({ s3, client: new s3.S3Client({ region, credentials }) }),
      (error: unknown) => {
        loaded = undefined;
        throw error;
      },
    ));
  // Every SDK call goes through here, so every failure is a DriveStorageError.
  const call = async <T>(work: (s3: typeof import("@aws-sdk/client-s3"), client: S3Client) => Promise<T>): Promise<T> => {
    try {
      const { s3, client } = await sdk();
      return await work(s3, client);
    } catch (error) {
      throw toStorageError(error);
    }
  };

  const storage: DriveStorage = {
    async exists(key) {
      try {
        await call((s3, c) => c.send(new s3.HeadObjectCommand({ Bucket, Key: key })));
        return true;
      } catch (error) {
        if ((error as DriveStorageError).kind === "NotFound") return false;
        throw error;
      }
    },

    copy: (sourceKey, destinationKey) =>
      // Single-request copy: S3's limit is 5 GB.
      call((s3, c) => c.send(new s3.CopyObjectCommand({ Bucket, Key: destinationKey, CopySource: copySource(bucket, sourceKey) }))).then(
        () => undefined,
      ),

    remove: (key) => call((s3, c) => c.send(new s3.DeleteObjectCommand({ Bucket, Key: key }))).then(() => undefined),

    listKeys: (prefix) =>
      call(async (s3, c) => {
        const keys: string[] = [];
        let ContinuationToken: string | undefined;
        do {
          const page = await c.send(new s3.ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }));
          for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
          ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (ContinuationToken);
        return keys;
      }),

    listFolder: (prefix) =>
      call(async (s3, c) => {
        const files: StoredFile[] = [];
        const folders: string[] = [];
        let ContinuationToken: string | undefined;
        do {
          const page = await c.send(new s3.ListObjectsV2Command({ Bucket, Prefix: prefix, Delimiter: "/", ContinuationToken }));
          for (const o of page.Contents ?? []) if (o.Key) files.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified });
          for (const p of page.CommonPrefixes ?? []) if (p.Prefix) folders.push(p.Prefix);
          ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (ContinuationToken);
        return { files, folders };
      }),

    listVersions: (prefix) =>
      call(async (s3, c) => {
        // S3 returns versions and delete markers in two lists, each newest first per key.
        // Grouped by key in S3's order, then merged newest first again.
        const byKey = new Map<string, ObjectVersion[]>();
        let KeyMarker: string | undefined;
        let VersionIdMarker: string | undefined;
        do {
          const page = await c.send(new s3.ListObjectVersionsCommand({ Bucket, Prefix: prefix, KeyMarker, VersionIdMarker }));
          const entries = [
            ...(page.Versions ?? []).map((v) => ({ v, deleteMarker: false, size: v.Size ?? 0 })),
            ...(page.DeleteMarkers ?? []).map((v) => ({ v, deleteMarker: true, size: 0 })),
          ];
          for (const { v, deleteMarker, size } of entries) {
            if (!v.Key || !v.VersionId) continue;
            const list = byKey.get(v.Key) ?? [];
            list.push({
              key: v.Key,
              versionId: v.VersionId,
              lastModified: v.LastModified ?? new Date(0),
              size,
              isLatest: !!v.IsLatest,
              deleteMarker,
            });
            byKey.set(v.Key, list);
          }
          KeyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
          VersionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
        } while (KeyMarker);
        // Stable sort: the latest first, then by time; same-second entries keep S3's order.
        const newestFirst = (a: ObjectVersion, b: ObjectVersion) =>
          Number(b.isLatest) - Number(a.isLatest) || b.lastModified.getTime() - a.lastModified.getTime();
        return [...byKey.values()].flatMap((list) => list.sort(newestFirst));
      }),

    removeVersion: ({ key, versionId }) =>
      call((s3, c) => c.send(new s3.DeleteObjectCommand({ Bucket, Key: key, VersionId: versionId }))).then(() => undefined),

    async restoreVersion({ key, versionId, isLatest, deleteMarker }) {
      if (deleteMarker) throw new DriveStorageError("Other", "A deleted version can't be restored.");
      // Already current; S3 may refuse copying an object onto itself.
      if (isLatest) return;
      // Single-request copy (5 GB limit, like copy). MetadataDirective COPY keeps the version's content type.
      await call((s3, c) => c.send(new s3.CopyObjectCommand({ Bucket, Key: key, CopySource: copySource(bucket, key, versionId) })));
    },

    read: (key) =>
      call(async (s3, c) => {
        const out = await c.send(new s3.GetObjectCommand({ Bucket, Key: key }));
        if (!out.Body) throw new DriveStorageError("Other", "The file came back empty from S3.");
        return out.Body.transformToByteArray();
      }),

    write: (key, body, { contentType, signal }) =>
      call(async (s3, c) => {
        signal?.throwIfAborted();
        const size = body instanceof Uint8Array ? body.byteLength : body.size;
        if (size <= PART_SIZE) {
          await c.send(new s3.PutObjectCommand({ Bucket, Key: key, Body: await bytes(body), ContentType: contentType }), {
            abortSignal: signal,
          });
          return;
        }
        // Multipart for big files (Google import allows up to 500 MB). An upload
        // left unfinished is aborted here, or else removed by the bucket's 7-day rule.
        const { UploadId } = await c.send(new s3.CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
        try {
          const parts: { ETag?: string; PartNumber: number }[] = [];
          for (let start = 0, PartNumber = 1; start < size; start += PART_SIZE, PartNumber++) {
            signal?.throwIfAborted();
            const Body = await bytes(body.slice(start, start + PART_SIZE));
            const { ETag } = await c.send(new s3.UploadPartCommand({ Bucket, Key: key, UploadId, PartNumber, Body }), {
              abortSignal: signal,
            });
            parts.push({ ETag, PartNumber });
          }
          await c.send(new s3.CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId, MultipartUpload: { Parts: parts } }));
        } catch (error) {
          await c.send(new s3.AbortMultipartUploadCommand({ Bucket, Key: key, UploadId })).catch(() => {});
          throw error;
        }
      }),
  };
  return storage;
}
