/**
 * The drive-storage contract against a real S3 bucket. Skipped unless
 * DRIVE_STORAGE_S3_BUCKET is set; run it by hand with credentials that may
 * write to the bucket, e.g. a scratch versioned bucket:
 *
 *   DRIVE_STORAGE_S3_BUCKET=my-scratch-bucket AWS_REGION=ap-southeast-1 \
 *   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=... \
 *   npm test -- test/driveStorage.s3.test.ts
 *
 * Each run writes under contract-tests/<timestamp>/ and leaves its versions
 * behind; use a scratch bucket, not the family's.
 */
import { describe } from "vitest";
import { s3DriveStorage } from "../src/storage/s3Storage";
import { driveStorageContract } from "./driveStorageContract";

// Vitest runs in Node; the web tsconfig has no Node types.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const bucket = env.DRIVE_STORAGE_S3_BUCKET;
const run = `contract-tests/${Date.now()}`;
let n = 0;

describe.skipIf(!bucket)("S3 adapter (manual)", () => {
  driveStorageContract("S3 adapter", () => ({
    storage: s3DriveStorage({
      bucket: bucket!,
      region: env.AWS_REGION ?? "ap-southeast-1",
      credentials: async () => ({
        accessKeyId: env.AWS_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "",
        sessionToken: env.AWS_SESSION_TOKEN,
      }),
    }),
    prefix: `${run}/${++n}/`,
  }));
});
