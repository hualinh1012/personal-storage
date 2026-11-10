/*
 * Dev-only: lets the playground render the real drive screen (Storage Browser
 * + our preview viewers) with sample data and no AWS. Listing comes from a
 * custom listLocationItems handler; S3 HEAD/GET requests made by previews are
 * answered by a fetch stub from the files below.
 */
import samplePdfUrl from "./sample.pdf?url";
import { sampleMarkdown } from "./samples";
import type { ListLocationItemsHandlerOutput } from "@aws-amplify/ui-react-storage/browser";
import { listDriveLocations, personalPrefix } from "../config";
import type { Access } from "../access";
import type { TrashOps } from "../trash/trash";
import { canWriteFor, type TrashDeps } from "../trash/actions";

type Items = ListLocationItemsHandlerOutput["items"];

export const MOCK_BUCKET = "family-drive-files-demo";
/** Who the playground is "signed in" as. */
export const MOCK_EMAIL = "you@example.com";
const REGION = "ap-southeast-1";

interface MockFile {
  key: string;
  size: number;
  contentType: string;
  body?: () => Promise<BodyInit>;
}

const files: MockFile[] = [
  { key: "Global/linh/Quang Vu-UIUX Designer.pdf", size: 525_100, contentType: "application/pdf", body: () => fetch(samplePdfUrl).then((r) => r.blob()) },
  { key: "Global/linh/Tết 2026 plan.md", size: sampleMarkdown.length, contentType: "text/markdown", body: async () => sampleMarkdown },
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
  // The signed-in person's own folder (Home lists it next to Global/).
  { key: `${personalPrefix(MOCK_EMAIL)}tax return 2025.pdf`, size: 525_100, contentType: "application/pdf", body: () => fetch(samplePdfUrl).then((r) => r.blob()) },
  { key: `${personalPrefix(MOCK_EMAIL)}passport scan.jpg`, size: 1_800_000, contentType: "image/jpeg" },
  // Already in the Deleted folder (issue #24), as Delete leaves them.
  { key: "Deleted/Global/linh/old photo (deleted 2026-11-08 10-15-00 a1b2).jpg", size: 2_100_000, contentType: "image/jpeg" },
  { key: "Deleted/Global/Tết 2026/draft plan (deleted 2026-11-09 21-40-07 9xk3).md", size: sampleMarkdown.length, contentType: "text/markdown", body: async () => sampleMarkdown },
];
const folders = ["Global/linh/", "Global/photos/", "Global/Tết 2026/", "Global/documents/", `${personalPrefix(MOCK_EMAIL)}receipts/`];
const modified = new Date("2026-11-05T08:32:00Z");

/** Every folder: the explicit (possibly empty) ones, plus every folder a file is in, like S3's listing. */
function allFolders(): string[] {
  const set = new Set(folders);
  for (const f of files) {
    for (let i = f.key.indexOf("/"); i !== -1; i = f.key.indexOf("/", i + 1)) set.add(f.key.slice(0, i + 1));
  }
  return [...set];
}

function listUnder(prefix: string): Items {
  const items: Items = [];
  for (const f of allFolders()) {
    const rest = f.slice(prefix.length);
    if (f.startsWith(prefix) && rest && rest.indexOf("/") === rest.length - 1) {
      items.push({ id: f, key: f, type: "FOLDER" });
    }
  }
  for (const f of files) {
    const rest = f.key.slice(prefix.length);
    if (f.key.startsWith(prefix) && !rest.includes("/")) {
      items.push({ id: f.key, key: f.key, type: "FILE", size: f.size, lastModified: modified, eTag: `"${f.size}"`, contentType: f.contentType });
    }
  }
  return items;
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

/**
 * The Deleted folder's S3 operations over the sample files (one version each),
 * so Delete, Restore, Delete permanently and Empty Deleted work in the playground.
 */
export function mockTrashOps(): TrashOps {
  const delay = () => new Promise((r) => setTimeout(r, 150));
  const index = (key: string) => files.findIndex((f) => f.key === key);
  return {
    async exists(key) {
      await delay();
      return index(key) !== -1;
    },
    async copy(sourceKey, destinationKey) {
      await delay();
      const source = files[index(sourceKey)];
      if (!source) throw new Error("NoSuchKey");
      files.push({ ...source, key: destinationKey });
    },
    async remove(key) {
      await delay();
      const i = index(key);
      if (i !== -1) files.splice(i, 1);
      const folder = folders.indexOf(key);
      if (folder !== -1) folders.splice(folder, 1);
    },
    async listKeys(prefix) {
      await delay();
      return [...folders.filter((f) => f.startsWith(prefix)), ...files.filter((f) => f.key.startsWith(prefix)).map((f) => f.key)];
    },
    async listVersions(prefix) {
      await delay();
      return files.filter((f) => f.key.startsWith(prefix)).map((f) => ({ key: f.key, versionId: "v1" }));
    },
    async removeVersion({ key }) {
      await delay();
      const i = index(key);
      if (i !== -1) files.splice(i, 1);
    },
  };
}

export function mockTrash(access: Access): TrashDeps {
  const ops = mockTrashOps();
  return { ops: async () => ops, canWriteTo: canWriteFor(access, MOCK_EMAIL) };
}

/**
 * The pager's folder count from the sample data, after a short delay like a
 * real LIST. `?count=fail` makes it fail, to preview the fallback pager.
 */
export function mockCountFolder(param: string | null) {
  return async (_config: unknown, prefix: string) => {
    await new Promise((r) => setTimeout(r, 600));
    if (param === "fail") throw new Error("count failed (playground)");
    return listUnder(prefix).length;
  };
}

export const mockSetup = (access: Access) => ({
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
        await new Promise((r) => setTimeout(r, 300));
        const all = listUnder(input.prefix).filter((i) => i.type !== input.options?.exclude);
        const start = Number(input.options?.nextToken ?? 0);
        const end = start + (input.options?.pageSize ?? all.length);
        return { items: all.slice(start, end), nextToken: end < all.length ? String(end) : undefined };
      },
    },
  },
});

/** Answers S3 requests for the mock bucket from the sample files. Call once. */
export function installS3FetchStub() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!url.hostname.includes(MOCK_BUCKET)) return realFetch(input, init);

    const key = decodeURIComponent(url.pathname.slice(1));
    const file = files.find((f) => f.key === key);
    if (!file) return new Response(null, { status: 404 });
    const headers = {
      "content-length": String(file.size),
      "content-type": file.contentType,
      etag: `"${file.size}"`,
      "last-modified": modified.toUTCString(),
    };
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "HEAD") return new Response(null, { status: 200, headers });
    const body = file.body ? await file.body() : new Blob([new Uint8Array(1)]);
    return new Response(body, { status: 200, headers: { "content-type": file.contentType } });
  };
}
