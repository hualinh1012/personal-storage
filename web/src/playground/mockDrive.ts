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
  // The signed-in person's own folder (Home lists it next to Global/).
  { key: `${personalPrefix(MOCK_EMAIL)}tax return 2025.pdf`, size: 525_100, contentType: "application/pdf", body: () => fetch(samplePdfUrl).then((r) => r.blob()) },
  { key: `${personalPrefix(MOCK_EMAIL)}passport scan.jpg`, size: 1_800_000, contentType: "image/jpeg" },
];
const folders = ["Global/linh/", "Global/Tết 2026/", "Global/documents/", `${personalPrefix(MOCK_EMAIL)}receipts/`];
const modified = new Date("2026-11-05T08:32:00Z");

function listUnder(prefix: string): Items {
  const items: Items = [];
  for (const f of folders) {
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

export const mockSetup = {
  config: {
    region: REGION,
    listLocations: listDriveLocations(MOCK_BUCKET, MOCK_EMAIL),
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
      listLocationItems: async (input: { prefix: string; options?: { exclude?: "FILE" | "FOLDER" } }) => ({
        items: listUnder(input.prefix).filter((i) => i.type !== input.options?.exclude),
        nextToken: undefined,
      }),
    },
  },
};

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
