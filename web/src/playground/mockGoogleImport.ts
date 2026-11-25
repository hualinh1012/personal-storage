/*
 * Dev-only: fake Google and S3 sides for the import view, so the playground
 * (?view=drive) can run the whole flow with no Google account or AWS. Picking
 * returns a fixed set covering each outcome, plus a nested folder. Files go into
 * the playground's in-memory drive, so they show in the list, and running the
 * same import twice shows the re-run skips.
 * ?google=off shows the "isn't set up yet" screen instead.
 */
import { DriveError, type DriveClient, type DriveFile } from "../googleImport/driveClient";
import type { GoogleImportDeps, ImportStorage } from "../googleImport/deps";
import type { PickedFile } from "../googleImport/plan";
import { sampleMarkdown } from "./samples";

const FOLDER = "application/vnd.google-apps.folder";

const picked: PickedFile[] = [
  { id: "g1", name: "Beach day 2025.jpg", mimeType: "image/jpeg", sizeBytes: 3_400_000 },
  { id: "g2", name: "  Passport scan.pdf", mimeType: "application/pdf", sizeBytes: 820_000 },
  // Same name and size as the sample plan in Global/linh/ (→ already imported there).
  { id: "g3", name: "Tết 2026 plan.md", mimeType: "text/markdown", sizeBytes: new TextEncoder().encode(sampleMarkdown).byteLength },
  { id: "g4", name: "Budget 2026", mimeType: "application/vnd.google-apps.spreadsheet" },
  { id: "g5", name: "Wedding video.mp4", mimeType: "video/mp4", sizeBytes: 48_000_000 },
  { id: "g6", name: "Rate-limited.jpg", mimeType: "image/jpeg", sizeBytes: 1_000_000 },
  { id: "g7", name: "Trip notes", mimeType: "application/vnd.google-apps.document" },
  { id: "g8", name: "Huge sheet", mimeType: "application/vnd.google-apps.spreadsheet" },
  { id: "g9", name: "RSVP form", mimeType: "application/vnd.google-apps.form" },
  { id: "g10", name: "Family reunion 4K.mov", mimeType: "video/quicktime", sizeBytes: 2_300_000_000 },
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

export function mockGoogleImport(enabled: boolean, storage: ImportStorage): GoogleImportDeps {
  return {
    config: enabled ? { clientId: "playground", apiKey: "playground", projectNumber: "0" } : null,
    google: {
      load: async () => {},
      token: async () => "playground-token",
      pick: async () => picked,
      drive: () => drive,
    },
    storage,
  };
}
