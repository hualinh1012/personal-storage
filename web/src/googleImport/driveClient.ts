/**
 * The one place that calls Google's Drive API. Takes the access token, so the
 * token never needs to be kept anywhere else, and a fetch to stub in tests.
 */

const DRIVE = "https://www.googleapis.com/drive/v3";

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message = `Google Drive answered HTTP ${status}`,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

export interface DriveClient {
  /** A non-Google-native file's bytes. */
  download(fileId: string, signal?: AbortSignal): Promise<Blob>;
}

export function createDriveClient(token: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): DriveClient {
  return {
    async download(fileId, signal) {
      const url = `${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
      const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal });
      if (!res.ok) throw new DriveError(res.status);
      return res.blob();
    },
  };
}
