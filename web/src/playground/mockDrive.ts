/*
 * Dev-only: lets the playground render the real drive screen (Storage Browser
 * + our preview viewers + every custom action) with sample data and no AWS.
 *
 * One in-memory drive (the drive-storage seam's own adapter, src/storage) holds
 * all the state: Storage Browser's listing comes from it through a custom
 * listLocationItems handler, S3 HEAD/GET requests made by previews are answered
 * from it by a fetch stub, and Move, Delete/Restore, Edit, the pager's count and
 * Google import all read and write it. A reload resets it.
 */
import samplePdfUrl from "./sample.pdf?url";
import { sampleMarkdown } from "./samples";
import type { ListLocationItemsHandlerOutput } from "@aws-amplify/ui-react-storage/browser";
import { listDriveLocations, personalPrefix } from "../locationPolicy";
import type { Access } from "../access";
import { DriveStorageError, type DriveStorage } from "../storage/driveStorage";
import { memoryDriveStorage, type MemoryDriveStorage, type MemorySeed } from "../storage/memoryStorage";

const sampleTextFile = "﻿Đi chợ Tết\r\n- gạo nếp\r\n- lá dong\r\n- đậu xanh\r\n";
const samplePdf = () => fetch(samplePdfUrl).then((r) => r.blob());

type Items = ListLocationItemsHandlerOutput["items"];

export const MOCK_BUCKET = "family-drive-files-demo";
/** Who the playground is "signed in" as. */
export const MOCK_EMAIL = "you@example.com";
const REGION = "ap-southeast-1";
const modified = new Date("2026-11-05T08:32:00Z");

const seed: MemorySeed[] = [
  { key: "Global/linh/Quang Vu-UIUX Designer.pdf", size: 525_100, contentType: "application/pdf", body: samplePdf },
  { key: "Global/linh/Tết 2026 plan.md", contentType: "text/markdown", body: sampleMarkdown },
  // A UTF-8 text file with a BOM and Windows line endings, for Edit (issue #45).
  { key: "Global/linh/shopping list.txt", contentType: "text/plain", body: sampleTextFile },
  // A different-size copy of a photo the Google import offers (→ imported as "(1)").
  { key: "Global/linh/Beach day 2025.jpg", size: 1_234, contentType: "image/jpeg" },
  { key: "Global/linh/a very long file name that keeps going to test the table width - final v3.docx", size: 48_000, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { key: "Global/linh/holiday-video.mp4", size: 120 * 1024 * 1024, contentType: "video/mp4" },
  ...Array.from({ length: 25 }, (_, i) => ({
    key: `Global/linh/photo-${String(i + 1).padStart(3, "0")}.jpg`,
    size: 2_400_000 + i * 1000,
    contentType: "image/jpeg",
  })),
  // A folder bigger than one page (Storage Browser shows 100 rows a page), for the pager.
  ...Array.from({ length: 250 }, (_, i) => ({
    key: `Global/photos/IMG_${String(i + 1).padStart(4, "0")}.jpg`,
    size: 3_100_000 + i * 1000,
    contentType: "image/jpeg",
  })),
  // Empty folders, as Storage Browser's Create folder leaves them.
  ...["Global/Tết 2026/", "Global/documents/", `${personalPrefix(MOCK_EMAIL)}receipts/`].map((key) => ({ key, body: "" })),
  // The signed-in person's own folder (Home lists it next to Global/).
  { key: `${personalPrefix(MOCK_EMAIL)}tax return 2025.pdf`, size: 525_100, contentType: "application/pdf", body: samplePdf },
  { key: `${personalPrefix(MOCK_EMAIL)}passport scan.jpg`, size: 1_800_000, contentType: "image/jpeg" },
  // Already in the Deleted folder (issue #24), as Delete leaves them.
  { key: "Deleted/Global/linh/old photo (deleted 2026-11-08 10-15-00 a1b2).jpg", size: 2_100_000, contentType: "image/jpeg" },
  { key: "Deleted/Global/Tết 2026/draft plan (deleted 2026-11-09 21-40-07 9xk3).md", contentType: "text/markdown", body: sampleMarkdown },
].map((s) => ({ lastModified: modified, ...s }));

/**
 * The playground's drive. `?count=fail` makes folder listings through the seam
 * fail, to preview the pager's fallback (Google import's folder check fails too).
 */
export function mockStorage(countParam: string | null): { memory: MemoryDriveStorage; storage: DriveStorage } {
  const memory = memoryDriveStorage(seed, { latency: () => new Promise((r) => setTimeout(r, 150)) });
  const storage: DriveStorage =
    countParam === "fail"
      ? {
          ...memory,
          listFolder: async () => {
            throw new DriveStorageError("Other", "count failed (playground)");
          },
        }
      : memory;
  return { memory, storage };
}

/** Storage Browser's rows for one folder of the in-memory drive. */
async function listUnder(memory: MemoryDriveStorage, prefix: string): Promise<Items> {
  const { files, folders } = await memory.listFolder(prefix);
  return [
    ...folders.map((f) => ({ id: f, key: f, type: "FOLDER" as const })),
    ...files
      .filter((f) => f.key !== prefix)
      .map((f) => ({
        id: f.key,
        key: f.key,
        type: "FILE" as const,
        size: f.size,
        lastModified: f.lastModified ?? modified,
        eTag: `"${f.size}"`,
        contentType: memory.get(f.key)?.contentType,
      })),
  ];
}

/**
 * The playground's access level from `?access=`: `read` (read-only Global/, no
 * personal folder), `read+personal`, `write` (no personal folder),
 * `write+personal`, with `+trash` for the Deleted folder. Absent: everything.
 */
export function mockAccess(param: string | null): Access {
  if (param === null) return { globalWrite: true, personal: true, trash: true };
  const [global, ...flags] = param.split(/[+ ]/);
  return { globalWrite: global === "write", personal: flags.includes("personal"), trash: flags.includes("trash") };
}

export const mockSetup = (access: Access, memory: MemoryDriveStorage) => ({
  config: {
    region: REGION,
    listLocations: listDriveLocations(MOCK_BUCKET, MOCK_EMAIL, access),
    getLocationCredentials: async () => ({
      credentials: {
        accessKeyId: "AKIAPLAYGROUND",
        secretAccessKey: "playground",
        sessionToken: "playground",
        expiration: new Date(Date.now() + 60 * 60 * 1000),
      },
    }),
    registerAuthListener: () => {},
  },
  actions: {
    default: {
      // Pages like S3: pageSize items at a time, with the offset as the continuation token.
      listLocationItems: async (input: {
        prefix: string;
        options?: { exclude?: "FILE" | "FOLDER"; pageSize?: number; nextToken?: string };
      }) => {
        await new Promise((r) => setTimeout(r, 150));
        const all = (await listUnder(memory, input.prefix)).filter((i) => i.type !== input.options?.exclude);
        const start = Number(input.options?.nextToken ?? 0);
        const end = start + (input.options?.pageSize ?? all.length);
        return { items: all.slice(start, end), nextToken: end < all.length ? String(end) : undefined };
      },
    },
  },
});

/** Answers S3 requests for the mock bucket from the in-memory drive. Call once. */
export function installS3FetchStub(memory: MemoryDriveStorage) {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!url.hostname.includes(MOCK_BUCKET)) return realFetch(input, init);

    const key = decodeURIComponent(url.pathname.slice(1));
    const file = memory.get(key);
    if (!file) return new Response(null, { status: 404 });
    const headers = {
      "content-length": String(file.size),
      "content-type": file.contentType,
      etag: `"${file.size}"`,
      "last-modified": file.lastModified.toUTCString(),
    };
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "HEAD") return new Response(null, { status: 200, headers });
    // Sample files without content get one byte; previews of them show an error, like a broken file.
    const body = file.body instanceof Uint8Array ? file.body.slice() : file.body ? await file.body() : new Uint8Array(1);
    return new Response(body, { status: 200, headers: { "content-type": file.contentType } });
  };
}
