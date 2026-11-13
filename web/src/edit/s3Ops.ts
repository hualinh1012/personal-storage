/**
 * The text editor's S3 operations, as the signed-in person (Identity Pool
 * credentials). IAM decides what they may read and write; the ⋮ menu only
 * offers Edit where the location allows writing. The SDK is loaded on first
 * use, like the Deleted folder's (trash/s3Ops.ts), so it stays out of the main bundle.
 */
import type { S3Target } from "../trash/s3Ops";
import type { TextFileOps } from "./textFile";

export async function s3TextOps({ bucket, region, credentials }: S3Target): Promise<TextFileOps> {
  const s3 = await import("@aws-sdk/client-s3");
  const client = new s3.S3Client({ region, credentials });

  return {
    async read(key) {
      const out = await client.send(new s3.GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!out.Body) throw new Error("The file came back empty from S3.");
      return out.Body.transformToByteArray();
    },
    async write(key, body, contentType) {
      await client.send(new s3.PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
  };
}
