/**
 * The drive-storage seam (issue #39): every S3 call our own features make
 * (Move, the Deleted folder, Edit, the pager's count, Google import) goes
 * through this interface. Two adapters implement it:
 *
 * - `s3DriveStorage` (s3Storage.ts): the files bucket, as the signed-in person,
 *   with the AWS SDK loaded on first use.
 * - `memoryDriveStorage` (memoryStorage.ts): a versioned bucket in memory, for
 *   the tests and the playground's single source of state.
 *
 * Both pass the same contract suite (test/driveStorageContract.ts). Storage
 * Browser's own list/upload/download handlers are outside this seam.
 */

/** One version or delete marker of an object (the bucket is versioned). */
export interface ObjectVersion {
  key: string;
  versionId: string;
  lastModified: Date;
  /** Bytes; 0 for a delete marker. */
  size: number;
  /** The newest entry for its key: the current content, or the marker that deleted it. */
  isLatest: boolean;
  /** A delete marker, not content. */
  deleteMarker: boolean;
}

export interface StoredFile {
  key: string;
  size: number;
  lastModified?: Date;
}

/** One level of a folder, the way S3 lists it with the "/" delimiter. */
export interface FolderListing {
  /** Objects directly under the prefix, including the folder's own placeholder (the prefix itself) if any. */
  files: StoredFile[];
  /** Subfolders (common prefixes), full keys ending in "/". */
  folders: string[];
}

export interface WriteOptions {
  contentType: string;
  /** Cancels an upload in progress; the write then rejects. */
  signal?: AbortSignal;
}

export interface DriveStorage {
  /** Whether a current (not deleted) object has this exact key. */
  exists(key: string): Promise<boolean>;
  /** Copies the current version of one object. Overwrites the destination: callers check first. */
  copy(sourceKey: string, destinationKey: string): Promise<void>;
  /** Deletes the current object (in a versioned bucket: adds a delete marker). Missing keys are fine. */
  remove(key: string): Promise<void>;
  /** Every current key under a prefix, at any depth, including folder placeholders (keys ending in "/"). */
  listKeys(prefix: string): Promise<string[]>;
  /** One level of a folder. */
  listFolder(prefix: string): Promise<FolderListing>;
  /**
   * Every version and delete marker under a prefix, newest first for each key.
   * It's a prefix: listing "a.txt" also lists "a.txt.bak", so callers filter by `key`.
   */
  listVersions(prefix: string): Promise<ObjectVersion[]>;
  /** Removes one version or delete marker for good. */
  removeVersion(version: Pick<ObjectVersion, "key" | "versionId">): Promise<void>;
  /**
   * Makes this version the current content of its key again, by copying it on
   * top. The replaced content stays as a version. The latest version is already
   * current, so nothing happens; a delete marker can't be restored (rejects).
   */
  restoreVersion(version: ObjectVersion): Promise<void>;
  /** The current object's bytes. */
  read(key: string): Promise<Uint8Array>;
  /** Creates or replaces an object. */
  write(key: string, body: Blob | Uint8Array, options: WriteOptions): Promise<void>;
}

export type DriveStorageErrorKind = "NotFound" | "AccessDenied" | "Aborted" | "Other";

/**
 * The one error type both adapters throw. `message` is what features show
 * people as the reason for a failure, so it's S3's own wording where there is one.
 */
export class DriveStorageError extends Error {
  readonly kind: DriveStorageErrorKind;
  constructor(kind: DriveStorageErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DriveStorageError";
    this.kind = kind;
  }
}

/** The one not-found rule. */
export const isNotFound = (error: unknown): boolean => error instanceof DriveStorageError && error.kind === "NotFound";

/** A failure's reason for people, from any thrown value. */
export const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));
