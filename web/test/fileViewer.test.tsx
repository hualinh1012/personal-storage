// @vitest-environment jsdom
/**
 * Opening a file: a click on its name opens the viewer popup (Previous/Next,
 * Download, Close); the row's ⋮ → View info opens the details panel.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostState } from "../src/driveHost/feature";
import { DriveHostContext } from "../src/driveHost/hostContext";
import { createOpenFileStore, OpenFileContext, positionOf, type OpenFileStore } from "../src/driveHost/openFile";
import { ActionsStoreContext, createActionsStore } from "../src/fileList/actionsStore";
import { FileTable, type FileTableProps } from "../src/fileList/FileTable";
import { locationPolicy } from "../src/locationPolicy";
import { extensionOf, fileName, folderOf, formatSize, positionText } from "../src/preview/fileInfo";
import { FileViewer, type FileViewerProps } from "../src/preview/FileViewer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("file info helpers", () => {
  it("formats sizes like the file list (1000-based)", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(999)).toBe("999 B");
    expect(formatSize(1234)).toBe("1.2 kB");
    expect(formatSize(41_500)).toBe("41.5 kB");
    expect(formatSize(125_829_120)).toBe("125.8 MB");
    expect(formatSize(999_960)).toBe("1.0 MB");
    expect(formatSize(undefined)).toBe("Unknown");
  });

  it("splits a key into name, folder and extension", () => {
    expect(fileName("Global/linh/plan.md")).toBe("plan.md");
    expect(folderOf("Global/linh/plan.md")).toBe("Global/linh/");
    expect(extensionOf("Global/linh/Photo.JPG")).toBe("jpg");
    expect(extensionOf("Global/.hidden")).toBeUndefined();
    expect(extensionOf("Global/README")).toBeUndefined();
  });

  it("gives a file's position among the listed ones", () => {
    const files = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(positionText(positionOf(files, "b"))).toBe("2 of 3");
    expect(positionText(positionOf(files, "zz"))).toBe("");
  });
});

describe("the open-file store", () => {
  it("notifies on a mode change only, and keeps the listed files without notifying", () => {
    const store = createOpenFileStore();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.getMode()).toBe("viewer");
    store.setMode("viewer");
    expect(listener).not.toHaveBeenCalled();
    store.setMode("info");
    expect(listener).toHaveBeenCalledTimes(1);
    store.setFiles([{ id: "a" }]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getFiles()).toEqual([{ id: "a" }]);
  });
});

const email = "a@x.com";
const access = { globalWrite: true, personal: true, trash: true };
const host: HostState = {
  email,
  access,
  location: { prefix: "Global/", path: "" },
  policy: locationPolicy(access, email, "Global/"),
  exitToFolder: () => {},
  takePick: () => false,
};

describe("opening files from the list and the viewer", () => {
  let container: HTMLDivElement;
  let root: Root;
  let store: OpenFileStore;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    store = createOpenFileStore();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (children: React.ReactNode) =>
    act(() =>
      root.render(
        <DriveHostContext.Provider value={host}>
          <ActionsStoreContext.Provider value={createActionsStore()}>
            <OpenFileContext.Provider value={store}>{children}</OpenFileContext.Provider>
          </ActionsStoreContext.Provider>
        </DriveHostContext.Provider>,
      ),
    );

  /** Rows like Storage Browser's: a folder, then two files with their own download. */
  function rows(onOpen: (i: number) => void, onDownload: (i: number) => void): FileTableProps {
    return {
      headers: [
        { key: "select", type: "checkbox", content: {} },
        { key: "name", type: "text", content: { text: "Name" } },
        { key: "download", type: "text", content: { text: "" } },
      ],
      rows: [0, 1, 2].map((i) => ({
        key: `id-${i}`,
        content: [
          { key: `checkbox-${i}`, type: "checkbox", content: { checked: false, onSelect: () => {} } },
          { key: `name-${i}`, type: "button", content: { icon: i === 0 ? "folder" : "file-image", label: i === 0 ? "pics/" : `p${i}.jpg`, onClick: () => onOpen(i) } },
          i === 0
            ? { key: `download-${i}`, type: "text", content: { text: "" } }
            : { key: `download-${i}`, type: "button", content: { icon: "download", ariaLabel: "download", onClick: () => onDownload(i) } },
        ],
      })),
    };
  }

  it("opens a file's name in the viewer and offers View info for files only", () => {
    const onOpen = vi.fn();
    const onDownload = vi.fn();
    render(<FileTable {...rows(onOpen, onDownload)} />);
    expect(store.getFiles().map((f) => f.id)).toEqual(["id-1", "id-2"]);

    store.setMode("info");
    act(() => [...container.querySelectorAll(".file-table__name")].find((n) => n.textContent === "p1.jpg")!.closest("button")!.click());
    expect(onOpen).toHaveBeenCalledWith(1);
    expect(store.getMode()).toBe("viewer");

    // A folder's ⋮ has no View info; a file's does, and it opens the file in "info".
    const menus = container.querySelectorAll<HTMLButtonElement>(".file-table__row-menu > button");
    act(() => menus[0].click());
    expect(container.textContent).not.toContain("View info");
    act(() => menus[0].click());
    act(() => menus[2].click());
    act(() => [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.lastChild?.textContent === "View info")!.click());
    expect(onOpen).toHaveBeenLastCalledWith(2);
    expect(store.getMode()).toBe("info");

    // The viewer's Download uses the row's own download.
    store.getFiles()[1].download?.();
    expect(onDownload).toHaveBeenCalledWith(2);
  });

  const file = { id: "id-1", key: "Global/p1.jpg", size: 1234, lastModified: new Date("2026-11-05T08:32:00Z") };
  const viewerProps = (over: Partial<FileViewerProps> = {}): FileViewerProps => ({
    activeFile: file,
    filePreview: { enabled: true, ok: true, url: "https://bucket.example/p1.jpg", fileData: { ...file, fileType: "image" } },
    activeFileHasPrev: false,
    activeFileHasNext: true,
    onSelectActiveFile: vi.fn(),
    ...over,
  });
  const dialog = () => document.body.querySelector<HTMLElement>('.viewer[role="dialog"]');

  it("shows the file full screen with its details, and moves with the arrows and keys", () => {
    store.setFiles([{ id: "id-1" }, { id: "id-2" }]);
    const props = viewerProps();
    render(<FileViewer {...props} />);
    expect(dialog()?.getAttribute("aria-label")).toBe("p1.jpg");
    expect(dialog()?.querySelector("img")?.getAttribute("src")).toBe("https://bucket.example/p1.jpg");
    expect(dialog()?.querySelector(".viewer__meta")?.textContent).toContain("1.2 kB");
    expect(dialog()?.querySelector(".viewer__meta")?.textContent).toContain("1 of 2");
    expect(dialog()?.querySelector<HTMLButtonElement>('[aria-label="Previous file"]')?.disabled).toBe(true);
    // No row download listed for it: Download falls back to the preview URL.
    expect(dialog()?.querySelector("a[download]")?.getAttribute("href")).toBe("https://bucket.example/p1.jpg");

    act(() => dialog()!.querySelector<HTMLButtonElement>('[aria-label="Next file"]')!.click());
    expect(props.onSelectActiveFile).toHaveBeenLastCalledWith("next");
    act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" })));
    expect(props.onSelectActiveFile).toHaveBeenCalledTimes(1); // no previous file
    act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(props.onSelectActiveFile).toHaveBeenLastCalledWith("next");
    act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(props.onSelectActiveFile).toHaveBeenLastCalledWith(undefined);
  });

  it("says when a file is too big or has no viewer, and offers Download", () => {
    const download = vi.fn();
    store.setFiles([{ id: "id-1", download }]);
    render(<FileViewer {...viewerProps({ filePreview: { enabled: true, ok: false, error: "LIMIT_EXCEEDED" } })} />);
    expect(dialog()?.textContent).toContain("File is too big to preview");
    act(() => dialog()!.querySelector<HTMLButtonElement>('[aria-label="Download p1.jpg"]')!.click());
    expect(download).toHaveBeenCalled();

    render(<FileViewer {...viewerProps({ filePreview: { enabled: true, ok: true, url: "u", fileData: { ...file, key: "Global/a.docx" } } })} />);
    expect(dialog()?.textContent).toContain("No preview for this type of file");
  });

  it("offers Try again when the file couldn't be loaded", () => {
    const onRetryFilePreview = vi.fn();
    render(<FileViewer {...viewerProps({ filePreview: { enabled: true, ok: false, error: "GENERIC_ERROR" }, onRetryFilePreview })} />);
    act(() => [...dialog()!.querySelectorAll("button")].find((b) => b.textContent === "Try again")!.click());
    expect(onRetryFilePreview).toHaveBeenCalled();
  });

  it("shows the details panel beside the list in info mode, with Open and Download", () => {
    store.setMode("info");
    const props = viewerProps();
    render(<FileViewer {...props} />);
    expect(dialog()).toBeNull();
    const panel = container.querySelector(".amplify-storage-browser__file-preview.file-info")!;
    const details = Object.fromEntries([...panel.querySelectorAll(".file-info__item")].map((i) => [i.querySelector("dt")!.textContent, i.querySelector("dd")!.textContent]));
    expect(details).toMatchObject({ Name: "p1.jpg", Folder: "Global/", Size: "1.2 kB", Type: "jpg" });
    expect(panel.querySelector("a[download], button[aria-label='Download p1.jpg']")).not.toBeNull();

    act(() => [...panel.querySelectorAll("button")].find((b) => b.textContent?.includes("Open"))!.click());
    expect(store.getMode()).toBe("viewer");
    expect(dialog()).not.toBeNull();
  });

  it("draws nothing while no file is open", () => {
    render(<FileViewer {...viewerProps({ activeFile: undefined })} />);
    expect(dialog()).toBeNull();
    expect(container.innerHTML).toBe("");
  });
});
