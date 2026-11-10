import { describe, expect, it, vi } from "vitest";
import { isSameOrSibling, sanitiseName, withSuffix } from "../src/googleImport/names";
import { conversionFor, convertedName } from "../src/googleImport/conversion";
import { warnOnLeave } from "../src/googleImport/leaveWarning";
import { ALREADY_IMPORTED, MAX_IMPORT_BYTES, NOT_SUPPORTED, TOO_LARGE, decideNames, folderPlaceholder, planFolder, type ImportItem, type PickedFile } from "../src/googleImport/plan";
import { listFolderTree } from "../src/googleImport/listing";
import { prepareImport } from "../src/googleImport/prepare";
import { isRetryable } from "../src/googleImport/retry";
import { withRetry } from "../src/googleImport/retry";
import { runQueue, type Outcome, type QueueItem } from "../src/googleImport/queue";
import { importFile, importItem, type ImportOps } from "../src/googleImport/importFile";
import { createDriveClient, DriveError } from "../src/googleImport/driveClient";

describe("sanitiseName", () => {
  it("replaces / and \\ and control characters with _", () => {
    expect(sanitiseName("a/b\\c\u0001d\u007fe")).toBe("a_b_c_d_e");
  });

  it("trims surrounding whitespace (Google names can have it)", () => {
    expect(sanitiseName("  F2F-286")).toBe("F2F-286");
    expect(sanitiseName("F2F-508 ")).toBe("F2F-508");
  });

  it("keeps ordinary and non-ASCII names as they are", () => {
    expect(sanitiseName("Tết 2026 (final) #1.jpg")).toBe("Tết 2026 (final) #1.jpg");
  });

  it("never returns an empty name or a dot path segment", () => {
    expect(sanitiseName("   ")).toBe("untitled");
    expect(sanitiseName(".")).toBe("_");
    expect(sanitiseName("..")).toBe("__");
  });
});

describe("withSuffix / isSameOrSibling", () => {
  it("puts the number before the extension", () => {
    expect(withSuffix("photo.jpg", 2)).toBe("photo (2).jpg");
    expect(withSuffix("notes", 1)).toBe("notes (1)");
  });

  it("recognises the name itself and its (n) siblings only", () => {
    expect(isSameOrSibling("photo.jpg", "photo.jpg")).toBe(true);
    expect(isSameOrSibling("photo.jpg", "photo (1).jpg")).toBe(true);
    expect(isSameOrSibling("photo.jpg", "photo (12).jpg")).toBe(true);
    expect(isSameOrSibling("photo.jpg", "photo (0).jpg")).toBe(false);
    expect(isSameOrSibling("photo.jpg", "photo (a).jpg")).toBe(false);
    expect(isSameOrSibling("photo.jpg", "photo (1).png")).toBe(false);
    expect(isSameOrSibling("photo.jpg", "my photo.jpg")).toBe(false);
  });
});

describe("decideNames", () => {
  it("skips a file with the same name and size as already imported", () => {
    expect(decideNames([{ name: "a.jpg", size: 5 }], [{ name: "a.jpg", size: 5 }])).toEqual([
      { action: "skip", reason: ALREADY_IMPORTED },
    ]);
  });

  it("matches a same-size (n) sibling too, so re-runs never create (2), (3)…", () => {
    const existing = [
      { name: "a.jpg", size: 5 },
      { name: "a (1).jpg", size: 9 },
    ];
    expect(decideNames([{ name: "a.jpg", size: 9 }], existing)).toEqual([{ action: "skip", reason: ALREADY_IMPORTED }]);
  });

  it("imports a same-name, different-size file as the next free (n), never overwriting", () => {
    const existing = [
      { name: "a.jpg", size: 5 },
      { name: "a (1).jpg", size: 6 },
    ];
    expect(decideNames([{ name: "a.jpg", size: 7 }], existing)).toEqual([{ action: "copy", name: "a (2).jpg" }]);
  });

  it("suffixes same-named files within one batch so neither is dropped", () => {
    expect(decideNames([{ name: "a.jpg", size: 5 }, { name: "a.jpg", size: 5 }], [])).toEqual([
      { action: "copy", name: "a.jpg" },
      { action: "copy", name: "a (1).jpg" },
    ]);
  });

  it("re-running that batch skips both: each existing file accounts for one incoming file", () => {
    const existing = [
      { name: "a.jpg", size: 5 },
      { name: "a (1).jpg", size: 5 },
    ];
    expect(decideNames([{ name: "a.jpg", size: 5 }, { name: "a.jpg", size: 5 }, { name: "a.jpg", size: 5 }], existing)).toEqual([
      { action: "skip", reason: ALREADY_IMPORTED },
      { action: "skip", reason: ALREADY_IMPORTED },
      { action: "copy", name: "a (2).jpg" },
    ]);
  });

  it("with an unknown size (converted files), any same-name or sibling file counts as imported", () => {
    expect(decideNames([{ name: "Doc.pdf" }], [{ name: "Doc (1).pdf", size: 1 }])).toEqual([
      { action: "skip", reason: ALREADY_IMPORTED },
    ]);
    expect(decideNames([{ name: "Doc.pdf" }], [])).toEqual([{ action: "copy", name: "Doc.pdf" }]);
  });
});

const file = (over: Partial<PickedFile> = {}): PickedFile => ({
  id: "id1",
  name: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 100,
  ...over,
});

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("conversionFor / convertedName", () => {
  it("maps each Google-native type to its export, and leaves other files alone", () => {
    expect(conversionFor("application/vnd.google-apps.document")).toEqual({ exportMimeType: "application/pdf", ext: ".pdf" });
    expect(conversionFor("application/vnd.google-apps.presentation")).toEqual({ exportMimeType: "application/pdf", ext: ".pdf" });
    expect(conversionFor("application/vnd.google-apps.spreadsheet")).toEqual({ exportMimeType: XLSX, ext: ".xlsx" });
    expect(conversionFor("application/vnd.google-apps.form")).toBe("unsupported");
    expect(conversionFor("image/jpeg")).toBeNull();
  });

  it("adds the extension unless the name already has it", () => {
    expect(convertedName("Budget", ".xlsx")).toBe("Budget.xlsx");
    expect(convertedName("Report.PDF", ".pdf")).toBe("Report.PDF");
  });
});

describe("planFolder", () => {
  it("puts files under the open folder with sanitised names", () => {
    const [item] = planFolder([file({ name: " a/b.jpg " })], "Global/linh/", "", []);
    expect(item).toMatchObject({ fileId: "id1", key: "Global/linh/a_b.jpg", path: "a_b.jpg", status: "queued", size: 100 });
  });

  it("maps a file below a picked folder to <open folder>/<folder path>/<name>", () => {
    const [item] = planFolder([file()], "Global/linh/", "Holiday/Day 1/", []);
    expect(item).toMatchObject({ key: "Global/linh/Holiday/Day 1/photo.jpg", path: "Holiday/Day 1/photo.jpg" });
  });

  it("converts Docs and Slides to PDF and Sheets to .xlsx, with no size", () => {
    const native = (id: string, kind: string) => file({ id, name: id, mimeType: `application/vnd.google-apps.${kind}`, sizeBytes: undefined });
    const items = planFolder([native("Doc", "document"), native("Deck", "presentation"), native("Sheet", "spreadsheet")], "Global/", "", []);
    expect(items.map((i) => [i.key, i.exportMimeType, i.contentType, i.size, i.status])).toEqual([
      ["Global/Doc.pdf", "application/pdf", "application/pdf", undefined, "queued"],
      ["Global/Deck.pdf", "application/pdf", "application/pdf", undefined, "queued"],
      ["Global/Sheet.xlsx", XLSX, XLSX, undefined, "queued"],
    ]);
  });

  it("skips other Google-native types as not supported", () => {
    const items = planFolder(
      ["form", "site", "map", "drawing", "shortcut"].map((k) => file({ id: k, mimeType: `application/vnd.google-apps.${k}` })),
      "Global/",
      "",
      [],
    );
    expect(items.every((i) => i.status === "skipped" && i.reason === NOT_SUPPORTED)).toBe(true);
  });

  it("skips files over 500 MB (from the Drive size, before downloading) and keeps the rest", () => {
    const items = planFolder(
      [file({ id: "big", name: "big.mov", sizeBytes: MAX_IMPORT_BYTES + 1 }), file({ id: "edge", name: "edge.mov", sizeBytes: MAX_IMPORT_BYTES })],
      "Global/",
      "",
      [],
    );
    expect(items.map((i) => [i.name, i.status, i.reason])).toEqual([
      ["big.mov", "skipped", TOO_LARGE],
      ["edge.mov", "queued", undefined],
    ]);
  });

  it("skips a converted file by name (or an (n) sibling) without needing its size", () => {
    const doc = file({ id: "d", name: "Trip notes", mimeType: "application/vnd.google-apps.document", sizeBytes: undefined });
    expect(planFolder([doc], "Global/", "", [{ name: "Trip notes (1).pdf", size: 123 }])[0]).toMatchObject({
      status: "skipped",
      reason: ALREADY_IMPORTED,
    });
  });

  it("applies the re-run rules against what's in the folder", () => {
    const items = planFolder(
      [file({ id: "same" }), file({ id: "bigger", name: "photo.jpg", sizeBytes: 200 }), file({ id: "dup", name: "photo.jpg ", sizeBytes: 300 })], "Global/", "", [{ name: "photo.jpg", size: 100 }]);
    expect(items.map((i) => [i.status, i.key])).toEqual([
      ["skipped", "Global/photo.jpg"],
      ["queued", "Global/photo (1).jpg"],
      ["queued", "Global/photo (2).jpg"],
    ]);
  });

  it("re-running an import that finished shows everything as already imported", () => {
    const picked = [file({ id: "a", name: "x.jpg" }), file({ id: "b", name: "x.jpg", sizeBytes: 7 })];
    const first = planFolder(picked, "Global/", "", []);
    const nowThere = first.map((i) => ({ name: i.name, size: i.size }));
    expect(planFolder(picked, "Global/", "", nowThere).map((i) => i.reason)).toEqual([ALREADY_IMPORTED, ALREADY_IMPORTED]);
  });
});

const FOLDER = "application/vnd.google-apps.folder";
type Pages = Record<string, { name: string; id: string; mimeType?: string; size?: number }[][]>;
function fakeDrive(pages: Pages) {
  const listChildren = vi.fn(async (folderId: string, pageToken?: string) => {
    const p = pages[folderId] ?? [[]];
    const i = pageToken ? Number(pageToken) : 0;
    return {
      files: p[i].map((f) => ({ mimeType: "image/jpeg", ...f })),
      nextPageToken: i + 1 < p.length ? String(i + 1) : undefined,
    };
  });
  return { listChildren };
}
const tree: Pages = {
  root: [
    [{ id: "a", name: "a.jpg", size: 1 }, { id: "sub", name: "Sub/dir", mimeType: FOLDER }],
    [{ id: "b", name: "b.jpg", size: 2 }, { id: "empty", name: "Empty", mimeType: FOLDER }],
  ],
  sub: [[{ id: "c", name: "c.jpg", size: 3 }, { id: "deep", name: "Deep", mimeType: FOLDER }]],
  deep: [[{ id: "d", name: "d.jpg", size: 4 }]],
};

describe("listFolderTree", () => {
  it("walks nested folders following every page, with sanitised folder paths", async () => {
    const drive = fakeDrive(tree);
    const result = await listFolderTree(drive, { id: "root", name: "Holiday" });
    expect(result.files.map((f) => f.dir + f.file.name)).toEqual([
      "Holiday/a.jpg",
      "Holiday/Sub_dir/c.jpg",
      "Holiday/Sub_dir/Deep/d.jpg",
      "Holiday/b.jpg",
    ]);
    expect(drive.listChildren.mock.calls.filter((c) => c[0] === "root").map((c) => c[1])).toEqual([undefined, "1"]);
  });

  it("reports empty folders, including a picked folder with nothing in it", async () => {
    expect((await listFolderTree(fakeDrive(tree), { id: "root", name: "Holiday" })).emptyDirs).toEqual(["Holiday/Empty/"]);
    expect((await listFolderTree(fakeDrive({}), { id: "x", name: "Nothing" })).emptyDirs).toEqual(["Nothing/"]);
  });
});

describe("prepareImport", () => {
  const picked: PickedFile[] = [
    { id: "top", name: "top.jpg", mimeType: "image/jpeg", sizeBytes: 9 },
    { id: "root", name: "Holiday", mimeType: FOLDER },
  ];

  it("plans picked files and folders recursively, listing each destination folder once", async () => {
    const listExisting = vi.fn(async (_prefix: string) => []);
    const plan = await prepareImport(picked, "Global/linh/", { drive: fakeDrive(tree), listExisting });
    expect(plan).toMatchObject({ pickedFiles: 1, pickedFolders: 1 });
    expect(plan.items.map((i) => [i.kind, i.key])).toEqual([
      ["file", "Global/linh/top.jpg"],
      ["file", "Global/linh/Holiday/a.jpg"],
      ["file", "Global/linh/Holiday/b.jpg"],
      ["file", "Global/linh/Holiday/Sub_dir/c.jpg"],
      ["file", "Global/linh/Holiday/Sub_dir/Deep/d.jpg"],
      ["folder", "Global/linh/Holiday/Empty/"],
    ]);
    expect(listExisting.mock.calls.map((c) => c[0]).sort()).toEqual([
      "Global/linh/",
      "Global/linh/Holiday/",
      "Global/linh/Holiday/Sub_dir/",
      "Global/linh/Holiday/Sub_dir/Deep/",
    ]);
  });

  it("importing a nested folder twice shows the second run as all skipped", async () => {
    const stored = new Map<string, number>();
    const listExisting = async (prefix: string) =>
      [...stored]
        .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
        .map(([k, size]) => ({ name: k.slice(prefix.length), size }));
    const ops: ImportOps = {
      exists: async (k) => stored.has(k),
      download: async (id) => new Blob([new Uint8Array({ top: 9, a: 1, b: 2, c: 3, d: 4 }[id] ?? 0)]),
      exportFile: async () => new Blob(["pdf"]),
      upload: async (k, data) => void stored.set(k, data.size),
    };
    const signal = new AbortController().signal;
    const first = await prepareImport(picked, "Global/", { drive: fakeDrive(tree), listExisting });
    await runQueue(first.items, (it, s) => importItem(it, ops, s), { concurrency: 3, signal });

    const second = await prepareImport(picked, "Global/", { drive: fakeDrive(tree), listExisting });
    const files = second.items.filter((i) => i.kind === "file");
    expect(files.every((i) => i.status === "skipped" && i.reason === ALREADY_IMPORTED)).toBe(true);
    const rerun = await runQueue(second.items, (it, s) => importItem(it, ops, s), { concurrency: 3, signal });
    expect(rerun.every((i) => i.status === "skipped")).toBe(true);
  });
});

describe("importItem for an empty folder", () => {
  const placeholder: ImportItem = folderPlaceholder("Global/", "Holiday/Empty/");
  const signal = new AbortController().signal;

  it("creates the zero-byte placeholder", async () => {
    const upload = vi.fn(async () => {});
    const ops = { exists: async () => false, download: vi.fn(), exportFile: vi.fn(), upload };
    await expect(importItem(placeholder, ops, signal)).resolves.toEqual({ status: "done", bytes: 0 });
    expect(upload).toHaveBeenCalledWith("Global/Holiday/Empty/", expect.any(Blob), "application/x-directory", signal);
    expect((upload.mock.calls[0] as unknown[])[1]).toMatchObject({ size: 0 });
  });

  it("is skipped when the folder is already there", async () => {
    const ops = { exists: async () => true, download: vi.fn(), exportFile: vi.fn(), upload: vi.fn() };
    await expect(importItem(placeholder, ops, signal)).resolves.toEqual({ status: "skipped", reason: ALREADY_IMPORTED });
  });
});

describe("isRetryable", () => {
  it("retries 429, 5xx and 403 rate limits, but not 403 for other reasons", () => {
    expect(isRetryable(new DriveError(429))).toBe(true);
    expect(isRetryable(new DriveError(503))).toBe(true);
    expect(isRetryable(new DriveError(403, "userRateLimitExceeded"))).toBe(true);
    expect(isRetryable(new DriveError(403))).toBe(true);
    expect(isRetryable(new DriveError(403, "insufficientFilePermissions"))).toBe(false);
    expect(isRetryable(new DriveError(404))).toBe(false);
  });
});

describe("withRetry", () => {
  const noSleep = () => Promise.resolve();

  it("retries retryable errors with exponential backoff, then succeeds", async () => {
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    const fn = vi.fn().mockRejectedValueOnce(new DriveError(429)).mockRejectedValueOnce(new DriveError(403)).mockResolvedValue("ok");
    await expect(withRetry(fn, { attempts: 4, baseDelayMs: 1000, sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("gives up after the last attempt and rethrows", async () => {
    const fn = vi.fn().mockRejectedValue(new DriveError(429));
    await expect(withRetry(fn, { attempts: 3, sleep: noSleep })).rejects.toMatchObject({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("doesn't retry other errors", async () => {
    const fn = vi.fn().mockRejectedValue(new DriveError(404));
    await expect(withRetry(fn, { attempts: 4, sleep: noSleep })).rejects.toMatchObject({ status: 404 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops retrying once aborted", async () => {
    const ac = new AbortController();
    const fn = vi.fn().mockImplementation(async () => {
      ac.abort();
      throw new DriveError(429);
    });
    await expect(withRetry(fn, { attempts: 4, sleep: noSleep, signal: ac.signal })).rejects.toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

function deferred() {
  let resolve!: (o: Outcome) => void;
  const promise = new Promise<Outcome>((r) => (resolve = r));
  return { promise, resolve };
}
const item = (id: string, status: QueueItem["status"] = "queued"): QueueItem => ({ id, status });

describe("runQueue", () => {
  it("runs at most `concurrency` items at a time and records each outcome", async () => {
    let running = 0;
    let peak = 0;
    const run = async (it: QueueItem): Promise<Outcome> => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      return it.id === "c" ? { status: "failed", reason: "nope" } : { status: "done" };
    };
    const final = await runQueue([item("a"), item("b"), item("c"), item("d"), item("e")], run, { concurrency: 3 });
    expect(peak).toBe(3);
    expect(final.map((i) => i.status)).toEqual(["done", "done", "failed", "done", "done"]);
    expect(final[2].reason).toBe("nope");
  });

  it("leaves items that were already skipped alone", async () => {
    const run = vi.fn(async (): Promise<Outcome> => ({ status: "done" }));
    const final = await runQueue([{ id: "a", status: "skipped", reason: "x" }, item("b")], run, { concurrency: 3 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(final[0]).toMatchObject({ status: "skipped", reason: "x" });
  });

  it("turns a thrown error into a failed item and carries on", async () => {
    const run = async (it: QueueItem): Promise<Outcome> => {
      if (it.id === "a") throw new Error("boom");
      return { status: "done" };
    };
    const final = await runQueue([item("a"), item("b")], run, { concurrency: 1 });
    expect(final.map((i) => [i.status, i.reason])).toEqual([["failed", "boom"], ["done", undefined]]);
  });

  it("reports copying and every change", async () => {
    const seen: string[] = [];
    await runQueue([item("a")], async () => ({ status: "done" }), {
      concurrency: 1,
      onChange: (items) => seen.push(items[0].status),
    });
    expect(seen).toEqual(["copying", "done"]);
  });

  it("on cancel drops queued items and aborts in-flight ones, marking both cancelled", async () => {
    const ac = new AbortController();
    const pending = deferred();
    const signals: AbortSignal[] = [];
    const run = (_it: QueueItem, signal: AbortSignal) => {
      signals.push(signal);
      signal.addEventListener("abort", () => pending.resolve({ status: "failed", reason: "aborted" }));
      return pending.promise;
    };
    const done = runQueue([item("a"), item("b"), item("c")], run, { concurrency: 1, signal: ac.signal });
    await Promise.resolve();
    ac.abort();
    const final = await done;
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(true);
    expect(final.map((i) => i.status)).toEqual(["cancelled", "cancelled", "cancelled"]);
  });
});

describe("importFile", () => {
  const blob = new Blob(["hello"]);
  const ops = (over: Partial<ImportOps> = {}): ImportOps => ({
    exists: vi.fn(async () => false),
    download: vi.fn(async () => blob),
    exportFile: vi.fn(async () => blob),
    upload: vi.fn(async () => {}),
    ...over,
  });
  const target = { fileId: "g1", key: "Global/photo.jpg", contentType: "image/jpeg" };
  const signal = new AbortController().signal;
  const retry = { sleep: () => Promise.resolve() };

  it("downloads from Drive and uploads to the key", async () => {
    const o = ops();
    await expect(importFile(target, o, signal, retry)).resolves.toEqual({ status: "done", bytes: 5 });
    expect(o.download).toHaveBeenCalledWith("g1", signal);
    expect(o.upload).toHaveBeenCalledWith("Global/photo.jpg", blob, "image/jpeg", signal);
  });

  it("never overwrites: skips a key that already exists without downloading", async () => {
    const o = ops({ exists: vi.fn(async () => true) });
    await expect(importFile(target, o, signal, retry)).resolves.toEqual({ status: "skipped", reason: "Already exists." });
    expect(o.download).not.toHaveBeenCalled();
    expect(o.upload).not.toHaveBeenCalled();
  });

  it("retries Drive rate limits, then fails with a reason", async () => {
    const download = vi.fn().mockRejectedValue(new DriveError(429));
    const result = await importFile(target, ops({ download }), signal, { ...retry, attempts: 3 });
    expect(download).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ status: "failed" });
    expect((result as { reason: string }).reason).toMatch(/Google Drive is busy/);
  });

  it("exports a converted file instead of downloading it", async () => {
    const o = ops();
    await importFile({ ...target, exportMimeType: "application/pdf" }, o, signal, retry);
    expect(o.exportFile).toHaveBeenCalledWith("g1", "application/pdf", signal);
    expect(o.download).not.toHaveBeenCalled();
  });

  it("fails a file too large to convert without retrying", async () => {
    const exportFile = vi.fn().mockRejectedValue(new DriveError(403, "exportSizeLimitExceeded"));
    await expect(importFile({ ...target, exportMimeType: "application/pdf" }, ops({ exportFile }), signal, retry)).resolves.toEqual({
      status: "failed",
      reason: "Too large to convert; download it from Google.",
    });
    expect(exportFile).toHaveBeenCalledTimes(1);
  });

  it("explains an upload failure", async () => {
    const o = ops({ upload: vi.fn().mockRejectedValue(new Error("Network error")) });
    await expect(importFile(target, o, signal, retry)).resolves.toEqual({
      status: "failed",
      reason: "Couldn't save it to Family Drive (Network error).",
    });
  });
});

describe("createDriveClient", () => {
  it("sends the token only to the Drive API and returns the bytes", async () => {
    const fetchMock = vi.fn(async () => new Response("abc"));
    const blob = await createDriveClient("tok", fetchMock as never).download("f/1");
    expect(await blob.text()).toBe("abc");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.googleapis.com/drive/v3/files/f%2F1?alt=media&supportsAllDrives=true");
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("throws a DriveError carrying the HTTP status", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 429 }));
    await expect(createDriveClient("tok", fetchMock as never).download("x")).rejects.toMatchObject({ status: 429 });
  });
});

describe("createDriveClient.listChildren", () => {
  it("asks for a folder's non-trashed children, a page at a time, and parses sizes", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ files: [{ id: "1", name: "a", mimeType: "image/jpeg", size: "42" }], nextPageToken: "p2" }),
    );
    const page = await createDriveClient("tok", fetchMock as never).listChildren("fold'er", "p1");
    expect(page).toEqual({ files: [{ id: "1", name: "a", mimeType: "image/jpeg", size: 42 }], nextPageToken: "p2" });
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.searchParams.get("q")).toBe(String.raw`'fold\'er' in parents and trashed = false`);
    expect(url.searchParams.get("pageToken")).toBe("p1");
  });

  it("puts Google's error reason on the DriveError", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, { status: 403 }),
    );
    await expect(createDriveClient("tok", fetchMock as never).listChildren("x")).rejects.toMatchObject({
      status: 403,
      reason: "rateLimitExceeded",
    });
  });
});

describe("warnOnLeave", () => {
  it("asks before leaving while active, and stops asking after cleanup", () => {
    const target = new EventTarget();
    const stop = warnOnLeave(target);
    const during = new Event("beforeunload", { cancelable: true });
    target.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);

    stop();
    const after = new Event("beforeunload", { cancelable: true });
    target.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
