/**
 * The one place that calls Google's Drive API. Takes the access token, so the
 * token never needs to be kept anywhere else, and a fetch to stub in tests.
 */

const DRIVE = "https://www.googleapis.com/drive/v3";

export class DriveError extends Error {
  constructor(
    readonly status: number,
    /** Google's error reason, e.g. "rateLimitExceeded", when it gave one. */
    readonly reason?: string,
  ) {
    super(`Google Drive answered HTTP ${status}${reason ? ` (${reason})` : ""}`);
    this.name = "DriveError";
  }
}

/** A Drive item, as listed. `size` is absent for folders and Google-native files. */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
}

export interface DrivePage {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface DriveClient {
  /** One page of a folder's children (not trashed). */
  listChildren(folderId: string, pageToken?: string, signal?: AbortSignal): Promise<DrivePage>;
  /** A non-Google-native file's bytes. */
  download(fileId: string, signal?: AbortSignal): Promise<Blob>;
  /** A Google Doc, Sheet or Slides file converted to `mimeType`. */
  exportFile(fileId: string, mimeType: string, signal?: AbortSignal): Promise<Blob>;
}

async function driveError(res: Response): Promise<DriveError> {
  let reason: string | undefined;
  try {
    const body = (await res.json()) as { error?: { errors?: { reason?: string }[] } };
    reason = body.error?.errors?.[0]?.reason;
  } catch {
    // not JSON; the status alone has to do
  }
  return new DriveError(res.status, reason);
}

export function createDriveClient(token: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): DriveClient {
  const get = async (path: string, signal?: AbortSignal) => {
    const res = await fetchImpl(`${DRIVE}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!res.ok) throw await driveError(res);
    return res;
  };
  return {
    async listChildren(folderId, pageToken, signal) {
      const params = new URLSearchParams({
        q: `'${folderId.replace(/['\\]/g, "\\$&")}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, size)",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const body = (await (await get(`/files?${params}`, signal)).json()) as {
        files?: { id: string; name: string; mimeType: string; size?: string }[];
        nextPageToken?: string;
      };
      return {
        files: (body.files ?? []).map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size !== undefined ? Number(f.size) : undefined,
        })),
        nextPageToken: body.nextPageToken,
      };
    },
    async download(fileId, signal) {
      return (await get(`/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, signal)).blob();
    },
    async exportFile(fileId, mimeType, signal) {
      const params = new URLSearchParams({ mimeType });
      return (await get(`/files/${encodeURIComponent(fileId)}/export?${params}`, signal)).blob();
    },
  };
}
