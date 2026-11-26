/*
 * Dev-only: lets the playground render the real drive screen (Storage Browser
 * + our preview viewers + every custom action) with sample data and no AWS.
 *
 * One in-memory drive (the drive-storage seam's own adapter, src/storage) holds
 * all the state: Storage Browser's listing comes from it through a custom
 * listLocationItems handler, S3 HEAD/GET requests made by previews are answered
 * from it by stubs for fetch, XMLHttpRequest (Amplify sends the preview's
 * HeadObject that way) and `<img src>` (Storage Browser's image viewer), and
 * Move, Delete/Restore, Edit, the pager's count and Google import all read and
 * write it. Sample JPEGs share one drawn photo. A reload resets it.
 */
import samplePdfUrl from "./sample.pdf?url";
import { sampleMarkdown } from "./samples";
import type { ListLocationItemsHandlerOutput } from "@aws-amplify/ui-react-storage/browser";
import { listDriveLocations, personalPrefix } from "../locationPolicy";
import type { Access } from "../access";
import type { ListInput } from "../driveHost/feature";
import { DriveStorageError, type DriveStorage } from "../storage/driveStorage";
import { memoryDriveStorage, type MemoryDriveStorage, type MemorySeed } from "../storage/memoryStorage";

const sampleTextFile = "﻿Đi chợ Tết\r\n- gạo nếp\r\n- lá dong\r\n- đậu xanh\r\n";
const samplePdf = () => fetch(samplePdfUrl).then((r) => r.blob());

/** One small drawn "photo" (sky, sea, sand) every sample JPEG serves, so image previews have something to show. */
let photo: Promise<Blob> | undefined;
const samplePhoto = () =>
  (photo ??= new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 320;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("no 2D canvas"));
    const band = (y: number, h: number, top: string, bottom: string) => {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(0, y, canvas.width, h);
    };
    band(0, 170, "#7ec8f0", "#d8f0fb");
    band(170, 70, "#1f78b4", "#4fb3d9");
    band(240, 80, "#f3dfa6", "#e2c27a");
    ctx.fillStyle = "#ffd84d";
    ctx.beginPath();
    ctx.arc(380, 70, 32, 0, 2 * Math.PI);
    ctx.fill();
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85);
  }));

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
].map((s: MemorySeed) => ({
  lastModified: modified,
  ...(s.contentType === "image/jpeg" && s.body === undefined ? { body: samplePhoto } : {}),
  ...s,
}));

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
  // Pages like S3: pageSize items at a time, with the offset as the continuation token.
  listLocationItems: async (input: ListInput) => {
    await new Promise((r) => setTimeout(r, 150));
    const all = (await listUnder(memory, input.prefix)).filter((i) => i.type !== input.options?.exclude);
    const start = Number(input.options?.nextToken ?? 0);
    const end = start + (input.options?.pageSize ?? all.length);
    return { items: all.slice(start, end), nextToken: end < all.length ? String(end) : undefined };
  },
});

const isMockBucket = (url: URL) => url.hostname.includes(MOCK_BUCKET);

/** An S3 HEAD/GET answer for the mock bucket, from the in-memory drive. */
async function respondS3(memory: MemoryDriveStorage, url: URL, method: string): Promise<Response> {
  const key = decodeURIComponent(url.pathname.slice(1));
  const file = memory.get(key);
  if (!file) return new Response(null, { status: 404 });
  const headers = {
    "content-length": String(file.size),
    "content-type": file.contentType,
    etag: `"${file.size}"`,
    "last-modified": file.lastModified.toUTCString(),
  };
  if (method.toUpperCase() === "HEAD") return new Response(null, { status: 200, headers });
  // Sample files without content get one byte; previews of them show an error, like a broken file.
  const body = file.body instanceof Uint8Array ? file.body.slice() : file.body ? await file.body() : new Uint8Array(1);
  return new Response(body, { status: 200, headers: { "content-type": file.contentType } });
}

/**
 * Answers S3 requests for the mock bucket from the in-memory drive, both through
 * `fetch` and through `XMLHttpRequest`: Amplify Storage sends some of Storage
 * Browser's calls (the preview's HeadObject, for one) with its XHR transfer
 * handler, so stubbing fetch alone leaves them to fail with "Network Error".
 * Call once.
 */
export function installS3FetchStub(memory: MemoryDriveStorage) {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    // Relative URLs (the sample PDF's own) resolve against the page.
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    if (!isMockBucket(url)) return realFetch(input, init);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    return respondS3(memory, url, method);
  };
  window.XMLHttpRequest = mockBucketXhr(memory);
  stubImageSources(memory);
}

/**
 * Storage Browser's image preview is an `<img src>` pointing at the mock bucket,
 * which neither stub sees. Mock-bucket sources are swapped for a blob URL of the
 * file from the in-memory drive (or a broken image when it's missing).
 */
function stubImageSources(memory: MemoryDriveStorage) {
  const proto = HTMLImageElement.prototype;
  const srcProp = Object.getOwnPropertyDescriptor(proto, "src")!;
  const setSrc = (img: HTMLImageElement, value: string) => srcProp.set!.call(img, value);
  const realSetAttribute = Element.prototype.setAttribute;
  const latest = new WeakMap<HTMLImageElement, string>();

  // True when it took the source over.
  const intercept = (img: HTMLImageElement, value: string) => {
    const url = new URL(value, location.href);
    if (!isMockBucket(url)) return false;
    latest.set(img, value);
    void respondS3(memory, url, "GET")
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (latest.get(img) !== value) return; // a newer source was set meanwhile
        setSrc(img, blob ? URL.createObjectURL(blob) : "data:image/jpeg;base64,");
      });
    return true;
  };

  Object.defineProperty(proto, "src", {
    ...srcProp,
    set(this: HTMLImageElement, value: string) {
      if (!intercept(this, String(value))) setSrc(this, value);
    },
  });
  proto.setAttribute = function (this: HTMLImageElement, name: string, value: string) {
    if (name.toLowerCase() === "src" && intercept(this, String(value))) return;
    realSetAttribute.call(this, name, value);
  };
}

/**
 * An XMLHttpRequest that answers mock-bucket requests from the in-memory drive
 * and passes every other request to the real one. It covers what Amplify's XHR
 * transfer handler reads: status, headers, response (text/blob/arraybuffer) and
 * the readystatechange/load/loadend events.
 */
function mockBucketXhr(memory: MemoryDriveStorage): typeof XMLHttpRequest {
  const Real = window.XMLHttpRequest;
  return class MockBucketXhr extends Real {
    #mock: { method: string; url: URL } | null = null;
    #done: { status: number; headers: string; response: unknown; text: string } | null = null;
    #aborted = false;

    override open(method: string, url: string | URL, ...rest: unknown[]): void {
      const parsed = new URL(String(url), location.href);
      if (isMockBucket(parsed)) {
        this.#mock = { method, url: parsed };
        return;
      }
      this.#mock = null;
      (super.open as (...a: unknown[]) => void)(method, url, ...rest);
    }

    override setRequestHeader(name: string, value: string): void {
      if (!this.#mock) super.setRequestHeader(name, value);
    }

    override send(body?: Document | XMLHttpRequestBodyInit | null): void {
      const mock = this.#mock;
      if (!mock) return super.send(body);
      void respondS3(memory, mock.url, mock.method).then(async (res) => {
        if (this.#aborted) return;
        const headers = [...res.headers].map(([k, v]) => `${k}: ${v}`).join("\r\n");
        const text = this.responseType === "" || this.responseType === "text" ? await res.text() : "";
        const response =
          this.responseType === "blob"
            ? await res.blob()
            : this.responseType === "arraybuffer"
              ? await res.arrayBuffer()
              : this.responseType === "json"
                ? JSON.parse((await res.text()) || "null")
                : text;
        if (this.#aborted) return;
        this.#done = { status: res.status, headers, response, text };
        for (const type of ["readystatechange", "load", "loadend"]) this.dispatchEvent(new ProgressEvent(type));
      });
    }

    override abort(): void {
      if (!this.#mock) return super.abort();
      this.#aborted = true;
      this.dispatchEvent(new ProgressEvent("abort"));
    }

    override get readyState(): number {
      return this.#mock ? (this.#done ? 4 : 1) : super.readyState;
    }
    override get status(): number {
      return this.#mock ? (this.#done?.status ?? 0) : super.status;
    }
    override get response(): unknown {
      return this.#mock ? (this.#done?.response ?? null) : super.response;
    }
    override get responseText(): string {
      return this.#mock ? (this.#done?.text ?? "") : super.responseText;
    }
    override getAllResponseHeaders(): string {
      return this.#mock ? (this.#done?.headers ?? "") : super.getAllResponseHeaders();
    }
    override getResponseHeader(name: string): string | null {
      if (!this.#mock) return super.getResponseHeader(name);
      const line = this.#done?.headers.split("\r\n").find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}: `));
      return line ? line.slice(name.length + 2) : null;
    }
  };
}
