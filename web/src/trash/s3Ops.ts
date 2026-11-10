/**
 * The Deleted folder's S3 operations, using the signed-in person's Identity Pool
 * credentials. Uses the AWS SDK rather than Amplify Storage because Amplify has
 * no version APIs (ListObjectVersions, DeleteObject with a version ID), which
 * Delete permanently and Empty Deleted need. The SDK is loaded on first use, so
 * it stays out of the main bundle.
 */
import type { ObjectVersion, TrashOps } from "./trash";

export interface S3Target {
  bucket: string;
  region: string;
  credentials: () => Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string; expiration?: Date }>;
}

const isNotFound = (error: unknown) => {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
};

/** CopySource is "bucket/key" with the key URL-encoded segment by segment. */
export function copySource(bucket: string, key: string): string {
  return `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function s3TrashOps({ bucket, region, credentials }: S3Target): Promise<TrashOps> {
  const s3 = await import("@aws-sdk/client-s3");
  const client = new s3.S3Client({ region, credentials });
  const Bucket = bucket;

  return {
    async exists(key) {
      try {
        await client.send(new s3.HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },

    async copy(sourceKey, destinationKey) {
      // Single-request copy: S3's limit is 5 GB, the same as Move's.
      await client.send(new s3.CopyObjectCommand({ Bucket, Key: destinationKey, CopySource: copySource(bucket, sourceKey) }));
    },

    async remove(key) {
      await client.send(new s3.DeleteObjectCommand({ Bucket, Key: key }));
    },

    async listKeys(prefix) {
      const keys: string[] = [];
      let ContinuationToken: string | undefined;
      do {
        const page = await client.send(new s3.ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }));
        for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key);
        ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return keys;
    },

    async listVersions(prefix) {
      const versions: ObjectVersion[] = [];
      let KeyMarker: string | undefined;
      let VersionIdMarker: string | undefined;
      do {
        const page = await client.send(new s3.ListObjectVersionsCommand({ Bucket, Prefix: prefix, KeyMarker, VersionIdMarker }));
        for (const v of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
          if (v.Key && v.VersionId) versions.push({ key: v.Key, versionId: v.VersionId });
        }
        KeyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
        VersionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
      } while (KeyMarker);
      return versions;
    },

    async removeVersion({ key, versionId }) {
      await client.send(new s3.DeleteObjectCommand({ Bucket, Key: key, VersionId: versionId }));
    },
  };
}
