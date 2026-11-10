import { describe, expect, it, vi } from "vitest";
import { isSameOrSibling, sanitiseName, withSuffix } from "../src/googleImport/names";
import { ALREADY_IMPORTED, decideNames, planPickedFiles, type PickedFile } from "../src/googleImport/plan";
import { withRetry } from "../src/googleImport/retry";
import { runQueue, type Outcome, type QueueItem } from "../src/googleImport/queue";
import { importFile, type ImportOps } from "../src/googleImport/importFile";
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

describe("planPickedFiles", () => {
  it("puts files under the open folder with sanitised names", () => {
    const [item] = planPickedFiles([file({ name: " a/b.jpg " })], "Global/linh/", []);
    expect(item).toMatchObject({ id: "id1", key: "Global/linh/a_b.jpg", status: "queued", size: 100 });
  });

  it("skips Google-native files until conversion is supported", () => {
    const [doc, shortcut] = planPickedFiles(
      [
        file({ id: "d", mimeType: "application/vnd.google-apps.document" }),
        file({ id: "s", mimeType: "application/vnd.google-apps.shortcut" }),
      ],
      "Global/",
      [],
    );
    expect(doc).toMatchObject({ status: "skipped", reason: "Google Docs, Sheets and Slides aren't supported yet." });
    expect(shortcut).toMatchObject({ status: "skipped" });
  });

  it("applies the re-run rules against what's in the folder", () => {
    const items = planPickedFiles(
      [file({ id: "same" }), file({ id: "bigger", name: "photo.jpg", sizeBytes: 200 }), file({ id: "dup", name: "photo.jpg ", sizeBytes: 300 })],
      "Global/",
      [{ name: "photo.jpg", size: 100 }],
    );
    expect(items.map((i) => [i.status, i.key])).toEqual([
      ["skipped", "Global/photo.jpg"],
      ["queued", "Global/photo (1).jpg"],
      ["queued", "Global/photo (2).jpg"],
    ]);
  });

  it("re-running an import that finished shows everything as already imported", () => {
    const picked = [file({ id: "a", name: "x.jpg" }), file({ id: "b", name: "x.jpg", sizeBytes: 7 })];
    const first = planPickedFiles(picked, "Global/", []);
    const nowThere = first.map((i) => ({ name: i.name, size: i.size }));
    expect(planPickedFiles(picked, "Global/", nowThere).map((i) => i.reason)).toEqual([ALREADY_IMPORTED, ALREADY_IMPORTED]);
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
    upload: vi.fn(async () => {}),
    ...over,
  });
  const target = { id: "g1", key: "Global/photo.jpg", contentType: "image/jpeg" };
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
