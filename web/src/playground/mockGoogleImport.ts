/*
 * Dev-only: fake Google and S3 sides for the import view, so the playground
 * (?view=drive) can run the whole flow with no Google account or AWS. Picking
 * returns a fixed set covering each outcome. ?google=off shows the
 * "isn't set up yet" screen instead.
 */
import { DriveError } from "../googleImport/driveClient";
import type { GoogleImportDeps } from "../googleImport/deps";
import type { PickedFile } from "../googleImport/plan";

const picked: PickedFile[] = [
  { id: "g1", name: "Beach day 2025.jpg", mimeType: "image/jpeg", sizeBytes: 3_400_000 },
  { id: "g2", name: "  Passport scan.pdf", mimeType: "application/pdf", sizeBytes: 820_000 },
  { id: "g3", name: "Tết 2026 plan.md", mimeType: "text/markdown", sizeBytes: 2_100 },
  { id: "g4", name: "Budget 2026", mimeType: "application/vnd.google-apps.spreadsheet" },
  { id: "g5", name: "Wedding video.mp4", mimeType: "video/mp4", sizeBytes: 48_000_000 },
  { id: "g6", name: "Rate-limited.jpg", mimeType: "image/jpeg", sizeBytes: 1_000_000 },
  { id: "g7", name: "Beach day 2025.jpg", mimeType: "image/jpeg", sizeBytes: 3_400_000 },
];

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

// What's "in S3" for the import: starts with a same-size copy of the plan (→ already
// imported) and a different-size beach photo (→ imported as "(1)"). Uploads are added,
// so running the same import twice shows the re-run skips.
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
      async download(_token, fileId, signal) {
        await wait(fileId === "g5" ? 4000 : 1200, signal);
        if (fileId === "g6") throw new DriveError(429);
        const size = picked.find((p) => p.id === fileId)?.sizeBytes ?? 0;
        return new Blob([new Uint8Array(size)]);
      },
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
