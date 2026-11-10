import { list } from "@aws-amplify/storage/internals";
import { countRows } from "./rows";

/** What Storage Browser passes to its list handler as `config` (the parts we use). */
interface ListConfig {
  bucket: string;
  region: string;
  accountId?: string;
  customEndpoint?: string;
  credentials: unknown;
}

/**
 * Counts the rows of the folder at `prefix` with one LIST per 1,000 objects,
 * using the same location credentials Storage Browser lists with.
 */
export async function countFolder(config: ListConfig, prefix: string): Promise<number> {
  const listing = await list({
    path: prefix,
    options: {
      listAll: true,
      subpathStrategy: { strategy: "exclude", delimiter: "/" },
      bucket: { bucketName: config.bucket, region: config.region },
      locationCredentialsProvider: config.credentials as never,
      expectedBucketOwner: config.accountId,
      customEndpoint: config.customEndpoint,
    },
  });
  return countRows(listing, prefix);
}
