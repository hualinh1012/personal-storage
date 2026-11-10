/*
 * Dev-only: fake Google and S3 sides for the import view, so the playground
 * (?view=drive) can run the whole flow with no Google account or AWS. Picking
 * returns a fixed set covering each outcome, plus a nested folder. Uploads are
 * remembered, so running the same import twice shows the re-run skips.
 * ?google=off shows the "isn't set up yet" screen instead.
 */
import { DriveError, type DriveClient, type DriveFile } from "../googleImport/driveClient";
import type { GoogleImportDeps } from "../googleImport/deps";
import type { PickedFile } from "../googleImport/plan";

const FOLDER = "application/vnd.google-apps.folder";

const picked: PickedFile[] = [
  { id: "g1", name: "Beach day 2025.jpg", mimeType: "image/jpeg", sizeBytes: 3_400_000 },
  { id: "g2", name: "  Passport scan.pdf", mimeType: "application/pdf", sizeBytes: 820_000 },
  { id: "g3", name: "Tết 2026 plan.md", mimeType: "text/markdown", sizeBytes: 2_100 },
  { id: "g4", name: "Budget 2026", mimeType: "application/vnd.google-apps.spreadsheet" },
  { id: "g5", name: "Wedding video.mp4", mimeType: "video/mp4", sizeBytes: 48_000_000 },
  { id: "g6", name: "Rate-limited.jpg", mimeType: "image/jpeg", sizeBytes: 1_000_000 },
  { id: "g7", name: "Trip notes", mimeType: "application/vnd.google-apps.document" },
  { id: "g8", name: "Huge sheet", mimeType: "application/vnd.google-apps.spreadsheet" },
  { id: "g9", name: "RSVP form", mimeType: "application/vnd.google-apps.form" },
  { id: "f1", name: "Holiday 2025", mimeType: FOLDER },
];

// Drive folders by ID. "f1" spans two pages to exercise paging.
const folders: Record<string, DriveFile[][]> = {
  f1: [
    [
      { id: "h1", name: "Day 1.jpg", mimeType: "image/jpeg", size: 2_000_000 },
      { id: "f2", name: "Videos", mimeType: FOLDER },
    ],
    [
      { id: "h2", name: "Day 2.jpg", mimeType: "image/jpeg", size: 2_100_000 },
      { id: "f3", name: "To sort", mimeType: FOLDER },
    ],
  ],
  f2: [[{ id: "h3", name: "Snorkel.mp4", mimeType: "video/mp4", size: 9_000_000 }]],
  f3: [[]],
};
const sizes = new Map<string, number>([
  ...picked.map((p) => [p.id, p.sizeBytes ?? 0] as const),
  ...Object.values(folders).flat(2).map((f) => [f.id, f.size ?? 0] as const),
]);

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

const drive: DriveClient = {
  async listChildren(folderId, pageToken) {
    await wait(200);
    const pages = folders[folderId] ?? [[]];
    const i = pageToken ? Number(pageToken) : 0;
    return { files: pages[i], nextPageToken: i + 1 < pages.length ? String(i + 1) : undefined };
  },
  async download(fileId, signal) {
    await wait(fileId === "g5" ? 4000 : 1200, signal);
    if (fileId === "g6") throw new DriveError(429, "rateLimitExceeded");
    return new Blob([new Uint8Array(sizes.get(fileId) ?? 0)]);
  },
  async exportFile(fileId, _mimeType, signal) {
    await wait(1500, signal);
    if (fileId === "g8") throw new DriveError(403, "exportSizeLimitExceeded");
    return new Blob([new Uint8Array(150_000)]);
  },
};

// What's "in S3": a same-size copy of the plan (→ already imported) and a
// different-size beach photo (→ imported as "(1)").
const stored = new Map<string, number>([
  ["Global/linh/Tết 2026 plan.md", 2_100],
  ["Global/linh/Beach day 2025.jpg", 1_234],
]);

export function mockGoogleImport(enabled: boolean): GoogleImportDeps {
  return {
    config: enabled ? { clientId: "playground", apiKey: "playground", projectNumber: "0" } : null,
    google: {
      load: async () => {},
      token: async () => "playground-token",
      pick: async () => picked,
      drive: () => drive,
    },
    storage: {
      async list(prefix) {
        return [...stored]
          .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
          .map(([key, size]) => ({ name: key.slice(prefix.length), size }));
      },
      exists: async (key) => stored.has(key),
      async upload(key, data, _type, signal) {
        await wait(600, signal);
        stored.set(key, data.size);
      },
    },
  };
}
