import { describe, expect, it, vi } from "vitest";
import { countRows, jumpStep, pageCount, pageLinks } from "../src/pagination/rows";
import { createFolderTracker, type ListInput, type ListOutput } from "../src/pagination/folderTracker";

const P = "Global/photos/";
/** The tracker reports a request finished on a later task. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("countRows", () => {
  it("counts files and subfolders like Storage Browser's rows", () => {
    const listing = {
      items: [{ path: `${P}a.jpg` }, { path: `${P}b.jpg` }],
      excludedSubpaths: [`${P}2025/`, `${P}2026/`],
    };
    expect(countRows(listing, P)).toBe(4);
  });

  it("leaves out the folder's own placeholder object", () => {
    expect(countRows({ items: [{ path: P }, { path: `${P}a.jpg` }] }, P)).toBe(1);
  });

  it("counts a zero-byte folder object once (as a folder row)", () => {
    // With a delimiter, `Global/photos/old/` comes back as a subpath, never as an item too.
    expect(countRows({ items: [], excludedSubpaths: [`${P}old/`] }, P)).toBe(1);
  });

  it("drops dot keys Storage Browser hides", () => {
    const listing = {
      items: [{ path: `${P}.` }, { path: `${P}..` }, { path: `${P}.hidden` }],
      excludedSubpaths: [`${P}/`, `${P}./`, `${P}../`],
    };
    expect(countRows(listing, P)).toBe(1);
  });

  it("is 0 for an empty folder", () => {
    expect(countRows({ items: [] }, P)).toBe(0);
  });
});

describe("pageCount", () => {
  it.each([
    [0, 1],
    [1, 1],
    [100, 1],
    [101, 2],
    [250, 3],
  ])("%i rows → %i pages", (rows, pages) => expect(pageCount(rows)).toBe(pages));
});

describe("pageLinks", () => {
  it("lists every page when there are few", () => {
    expect(pageLinks(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("shows the start, the end and the pages around the current one", () => {
    expect(pageLinks(1, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
    expect(pageLinks(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageLinks(19, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
  });
});

describe("jumpStep", () => {
  const base = { target: 3, page: 1, loadedRows: 200, hasMore: true, fetching: false };
  it("waits while a page is loading", () => {
    expect(jumpStep({ ...base, fetching: true })).toBe("wait");
  });
  it("paginates until the target page's rows are loaded", () => {
    expect(jumpStep(base)).toBe("paginate");
    expect(jumpStep({ ...base, page: 3 })).toBe("paginate");
  });
  it("is done once the target page shows with its rows", () => {
    expect(jumpStep({ ...base, page: 3, loadedRows: 201 })).toBe("done");
  });
  it("stops when S3 has nothing more", () => {
    expect(jumpStep({ ...base, page: 3, hasMore: false })).toBe("done");
  });
});

/** A fake list handler over `total` rows, paging by offset tokens. */
function fakeHandler(total: number) {
  const calls: (string | undefined)[] = [];
  const handler = vi.fn(async (input: ListInput): Promise<ListOutput> => {
    calls.push(input.options?.nextToken);
    const start = Number(input.options?.nextToken ?? 0);
    const end = Math.min(total, start + (input.options?.pageSize ?? total));
    return { items: Array.from({ length: end - start }), nextToken: end < total ? String(end) : undefined };
  });
  return { handler, calls };
}

const page = (prefix: string, nextToken?: string, extra: Partial<ListInput["options"]> = {}): ListInput => ({
  config: {},
  prefix,
  options: { pageSize: 100, nextToken, ...extra },
});

describe("folder tracker", () => {
  it("counts the folder when its first page is listed", async () => {
    const count = vi.fn(async () => 250);
    const t = createFolderTracker(count);
    const { handler } = fakeHandler(250);
    await t.wrap(handler)(page(P));
    await Promise.resolve();
    expect(count).toHaveBeenCalledWith({}, P);
    expect(t.getState()).toMatchObject({ prefix: P, mode: "browse", count: { status: "done", total: 250 }, loadedRows: 100, hasMore: true });
  });

  it("recounts on every first-page listing (refresh, back from an action)", async () => {
    const count = vi.fn(async () => 1);
    const list = createFolderTracker(count).wrap(fakeHandler(1).handler);
    await list(page(P));
    await list(page(P));
    expect(count).toHaveBeenCalledTimes(2);
  });

  it("adds each fetched page to the loaded rows", async () => {
    const t = createFolderTracker(async () => 250);
    const list = t.wrap(fakeHandler(250).handler);
    await list(page(P));
    await list(page(P, "100"));
    await list(page(P, "200"));
    await tick();
    expect(t.getState()).toMatchObject({ loadedRows: 250, hasMore: false, fetching: false });
  });

  it("answers a repeated page request with no rows and the right next token", async () => {
    const t = createFolderTracker(async () => 250);
    const { handler, calls } = fakeHandler(250);
    const list = t.wrap(handler);
    await list(page(P));
    await list(page(P, "100"));
    await expect(list(page(P, "100"))).resolves.toEqual({ items: [], nextToken: "200" });
    expect(calls).toEqual([undefined, "100"]);
    expect(t.getState()).toMatchObject({ loadedRows: 200, fetching: true });
    await tick();
    // Still a finished request, so a jump waiting on it takes its next step.
    expect(t.getState().fetching).toBe(false);
  });

  it("drops a count that finishes after the person moved to another folder", async () => {
    let finishFirst: (n: number) => void = () => {};
    const count = vi.fn((_c: unknown, prefix: string) =>
      prefix === P ? new Promise<number>((r) => (finishFirst = r)) : Promise.resolve(3),
    );
    const t = createFolderTracker(count);
    const list = t.wrap(fakeHandler(3).handler);
    await list(page(P));
    await list(page("Global/docs/"));
    await Promise.resolve();
    finishFirst(999);
    await Promise.resolve();
    expect(t.getState()).toMatchObject({ prefix: "Global/docs/", count: { status: "done", total: 3 } });
  });

  it("marks a failed count without breaking the listing", async () => {
    const t = createFolderTracker(async () => {
      throw new Error("AccessDenied");
    });
    const out = await t.wrap(fakeHandler(5).handler)(page(P));
    await Promise.resolve();
    expect(out.items).toHaveLength(5);
    expect(t.getState().count).toEqual({ status: "failed" });
  });

  it("switches to search mode for search listings (1,000 at a time) and doesn't count", async () => {
    const count = vi.fn(async () => 1);
    const t = createFolderTracker(count);
    const list = t.wrap(fakeHandler(5).handler);
    await list(page(P));
    await list(page(P, undefined, { pageSize: 1000 }));
    expect(count).toHaveBeenCalledTimes(1);
    expect(t.getState().mode).toBe("search");
  });

  it("ignores Copy/Move destination listings", async () => {
    const count = vi.fn(async () => 1);
    const t = createFolderTracker(count);
    await t.wrap(fakeHandler(5).handler)(page("Global/other/", undefined, { exclude: "FILE" }));
    expect(count).not.toHaveBeenCalled();
    expect(t.getState().prefix).toBeUndefined();
  });

  it("counts a failed page request so a jump can stop", async () => {
    const t = createFolderTracker(async () => 250);
    const failing = vi.fn(async (input: ListInput): Promise<ListOutput> => {
      if (input.options?.nextToken) throw new Error("network");
      return { items: Array.from({ length: 100 }), nextToken: "100" };
    });
    const list = t.wrap(failing);
    await list(page(P));
    await expect(list(page(P, "100"))).rejects.toThrow("network");
    await tick();
    expect(t.getState()).toMatchObject({ failures: 1, fetching: false, loadedRows: 100 });
  });
});
