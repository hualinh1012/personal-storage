/**
 * The drive-storage in-memory adapter: a versioned bucket held in a Map, for
 * the tests and the playground (where it's the single source of state, so a
 * file imported from Google shows in the list, can be moved, deleted and
 * restored). Behaves like the S3 adapter as far as the contract suite checks:
 * removing adds a delete marker, removing the latest version uncovers the one
 * before, and every failure is a DriveStorageError.
 */
import { DriveStorageError, type DriveStorage, type FolderListing, type ObjectVersion } from "./driveStorage";

/** An object's content: bytes, or a loader for sample data fetched on demand. */
export type MemoryBody = Uint8Array | (() => Promise<Blob>);

export interface MemoryObject {
  size: number;
  contentType: string;
  lastModified: Date;
  /** Absent for sample files that only need to appear in a listing. */
  body?: MemoryBody;
}

type VersionBody = { deleteMarker: true } | { deleteMarker?: false; object: MemoryObject };
type Version = { versionId: string; lastModified: Date } & VersionBody;

export interface MemorySeed {
  key: string;
  size?: number;
  contentType?: string;
  lastModified?: Date;
  body?: MemoryBody | string;
}

export interface MemoryDriveStorage extends DriveStorage {
  /** The current object at a key, for things outside the seam (the playground's listing and fetch stub). */
  get(key: string): MemoryObject | undefined;
  /** Every current key, in insertion order. */
  keys(): string[];
}

export interface MemoryOptions {
  /** Called before every operation, e.g. a short delay so the playground feels like S3. */
  latency?: () => Promise<void>;
  now?: () => Date;
}

const utf8 = (s: string) => new TextEncoder().encode(s);
const sizeOf = (body: MemoryBody | undefined) => (body instanceof Uint8Array ? body.byteLength : 0);

export function memoryDriveStorage(seed: MemorySeed[] = [], options: MemoryOptions = {}): MemoryDriveStorage {
  const history = new Map<string, Version[]>();
  let nextVersion = 1;
  const now = options.now ?? (() => new Date());
  const latency = options.latency ?? (async () => {});

  const current = (key: string): MemoryObject | undefined => {
    const latest = history.get(key)?.at(-1);
    return latest && !latest.deleteMarker ? latest.object : undefined;
  };
  const push = (key: string, version: VersionBody) => {
    const versions = history.get(key) ?? [];
    const lastModified = version.deleteMarker ? now() : version.object.lastModified;
    versions.push({ ...version, versionId: `v${nextVersion++}`, lastModified });
    history.set(key, versions);
  };
  const put = (key: string, object: MemoryObject) => push(key, { object });
  const currentKeys = () => [...history.keys()].filter((k) => current(k));
  const notFound = (key: string) => new DriveStorageError("NotFound", `No such key: ${key}`);
  const cannotRestoreMarker = () => new DriveStorageError("Other", "A deleted version can't be restored.");

  for (const s of seed) {
    const body = typeof s.body === "string" ? utf8(s.body) : s.body;
    put(s.key, {
      size: s.size ?? sizeOf(body),
      contentType: s.contentType ?? "application/octet-stream",
      lastModified: s.lastModified ?? now(),
      body,
    });
  }

  return {
    get: current,
    keys: currentKeys,

    async exists(key) {
      await latency();
      return !!current(key);
    },

    async copy(sourceKey, destinationKey) {
      await latency();
      const source = current(sourceKey);
      if (!source) throw notFound(sourceKey);
      put(destinationKey, { ...source, lastModified: now() });
    },

    async remove(key) {
      await latency();
      if (current(key)) push(key, { deleteMarker: true });
    },

    async listKeys(prefix) {
      await latency();
      return currentKeys().filter((k) => k.startsWith(prefix));
    },

    async listFolder(prefix): Promise<FolderListing> {
      await latency();
      const listing: FolderListing = { files: [], folders: [] };
      for (const key of currentKeys().filter((k) => k.startsWith(prefix)).sort()) {
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash === -1 || key === prefix) {
          const o = current(key)!;
          listing.files.push({ key, size: o.size, lastModified: o.lastModified });
        } else {
          const folder = prefix + rest.slice(0, slash + 1);
          if (!listing.folders.includes(folder)) listing.folders.push(folder);
        }
      }
      return listing;
    },

    async listVersions(prefix) {
      await latency();
      const out: ObjectVersion[] = [];
      for (const [key, versions] of history) {
        if (!key.startsWith(prefix)) continue;
        // History is oldest first; S3 lists each key newest first.
        for (let i = versions.length - 1; i >= 0; i--) {
          const v = versions[i];
          out.push({
            key,
            versionId: v.versionId,
            lastModified: v.lastModified,
            size: v.deleteMarker ? 0 : v.object.size,
            isLatest: i === versions.length - 1,
            deleteMarker: !!v.deleteMarker,
          });
        }
      }
      return out;
    },

    async removeVersion({ key, versionId }) {
      await latency();
      const versions = history.get(key);
      const i = versions?.findIndex((v) => v.versionId === versionId) ?? -1;
      if (!versions || i === -1) return; // Like S3: deleting a missing version succeeds.
      versions.splice(i, 1);
      if (versions.length === 0) history.delete(key);
    },

    async restoreVersion({ key, versionId, isLatest, deleteMarker }) {
      if (deleteMarker) throw cannotRestoreMarker();
      if (isLatest) return;
      await latency();
      const version = history.get(key)?.find((v) => v.versionId === versionId);
      if (!version) throw new DriveStorageError("NotFound", `No such version of ${key}: ${versionId}`);
      if (version.deleteMarker) throw cannotRestoreMarker();
      put(key, { ...version.object, lastModified: now() });
    },

    async read(key) {
      await latency();
      const o = current(key);
      if (!o) throw notFound(key);
      if (!o.body) throw new DriveStorageError("Other", `${key} has no content (sample listing only).`);
      return o.body instanceof Uint8Array ? o.body.slice() : new Uint8Array(await (await o.body()).arrayBuffer());
    },

    async write(key, body, { contentType, signal }) {
      if (signal?.aborted) throw new DriveStorageError("Aborted", "Cancelled");
      await latency();
      if (signal?.aborted) throw new DriveStorageError("Aborted", "Cancelled");
      // Blobs are immutable, so they're kept as they are (no copy of a big import).
      const stored: MemoryBody = body instanceof Uint8Array ? body.slice() : async () => body;
      const size = body instanceof Uint8Array ? body.byteLength : body.size;
      put(key, { size, contentType, lastModified: now(), body: stored });
    },
  };
}
