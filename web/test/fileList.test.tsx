// @vitest-environment jsdom
/**
 * The Drive-style file list (issue #13): Storage Browser's DataTable,
 * ActionsList and Navigation slots drawn our way, with the same behaviour.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostState } from "../src/driveHost/feature";
import { DriveHostContext } from "../src/driveHost/hostContext";
import { ActionsMenu } from "../src/fileList/ActionsMenu";
import { ActionsStoreContext, createActionsStore, selectionActions } from "../src/fileList/actionsStore";
import { Breadcrumb } from "../src/fileList/Breadcrumb";
import { FileTable, type FileTableProps } from "../src/fileList/FileTable";
import { driveIcon } from "../src/fileList/icons";
import { locationPolicy } from "../src/locationPolicy";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("driveIcon", () => {
  it("draws Storage Browser's file types as Material Symbols with a kind for the colour", () => {
    expect(driveIcon("folder")).toEqual({ name: "folder", filled: true, kind: "folder" });
    expect(driveIcon("file-pdf")?.kind).toBe("pdf");
    expect(driveIcon("file-excel")?.kind).toBe("sheet");
    expect(driveIcon("file-something-new")?.kind).toBe("file");
    expect(driveIcon("action-success")?.name).toBe("check_circle");
    expect(driveIcon(undefined)).toBeUndefined();
  });
});

describe("selectionActions", () => {
  it("leaves out hidden actions and the folder's own (New menu) actions", () => {
    const state = {
      items: [
        { actionType: "copy", label: "Copy" },
        { actionType: "upload", label: "Upload" },
        { actionType: "editText", label: "Edit", isHidden: true },
      ],
    };
    expect(selectionActions(state, new Set(["upload"])).map((i) => i.actionType)).toEqual(["copy"]);
  });
});

const email = "a@x.com";
const access = { globalWrite: true, personal: true, trash: true };
function hostAt(prefix: string | null, actionType?: string): HostState {
  return {
    email,
    access,
    location: prefix ? { prefix, path: "" } : null,
    actionType,
    policy: locationPolicy(access, email, prefix ?? "Global/"),
    exitToFolder: () => {},
    takePick: () => false,
  };
}

/** Rows like Storage Browser's folder list: a checkbox, the name button, a date, a size. */
function listProps(checked: boolean[], onSelect: (i: number) => void, onOpen = vi.fn()): FileTableProps {
  return {
    headers: [
      { key: "select", type: "checkbox", content: { label: "Select all" } },
      { key: "name", type: "sort", content: { label: "Name", sortDirection: "ascending" } },
      { key: "size", type: "text", content: { text: "Size" } },
    ],
    rows: checked.map((c, i) => ({
      key: `row-${i}`,
      content: [
        { key: "select", type: "checkbox", content: { checked: c, label: `Select file ${i}`, onSelect: () => onSelect(i) } },
        { key: "name", type: "button", content: { icon: i === 0 ? "folder" : "file-image", label: `file ${i}`, onClick: () => onOpen(i) } },
        { key: "size", type: "number", content: { value: 10, displayValue: "10 B" } },
      ],
    })),
  };
}

describe("FileTable, ActionsMenu and Breadcrumb", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const store = createActionsStore(["upload"]);
  const render = (host: HostState, children: React.ReactNode) =>
    act(() =>
      root.render(
        <DriveHostContext.Provider value={host}>
          <ActionsStoreContext.Provider value={store}>{children}</ActionsStoreContext.Provider>
        </DriveHostContext.Provider>,
      ),
    );

  it("draws each row with its type icon and opens a file from its name, as before", () => {
    const onOpen = vi.fn();
    render(hostAt("Global/"), <FileTable {...listProps([false, false], () => {}, onOpen)} />);
    const icons = [...container.querySelectorAll("tbody .file-icon")].map((i) => i.className);
    expect(icons).toEqual(["icon icon--filled file-icon file-icon--folder", "icon icon--filled file-icon file-icon--image"]);
    act(() => container.querySelectorAll<HTMLButtonElement>(".file-table__button")[1].click());
    expect(onOpen).toHaveBeenCalledWith(1);
    expect(container.querySelector("table")?.classList.contains("amplify-storage-browser__table")).toBe(true);
  });

  it("toggles a row when its empty space is clicked, not when its name is", () => {
    const onSelect = vi.fn();
    render(hostAt("Global/"), <FileTable {...listProps([false, false], onSelect)} />);
    act(() => container.querySelectorAll("tbody td")[2].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith(0);
    onSelect.mockClear();
    act(() => container.querySelectorAll<HTMLButtonElement>(".file-table__button")[0].click());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows a toolbar with the selection's actions while rows are selected, and clears the selection", () => {
    const onSelect = vi.fn();
    const onActionSelect = vi.fn();
    render(
      hostAt("Global/"),
      <>
        <ActionsMenu
          items={[
            { actionType: "copy", label: "Copy" },
            { actionType: "delete", label: "Delete", isDisabled: true },
            { actionType: "upload", label: "Upload" },
          ]}
          onActionSelect={onActionSelect}
        />
        <FileTable {...listProps([true, true, false], onSelect)} />
      </>,
    );
    const toolbar = container.querySelector('[role="toolbar"]')!;
    expect(toolbar.textContent).toContain("2 selected");
    // Enabled selection actions only: Upload is the folder's, Delete is disabled here.
    const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(buttons.map((b) => b.textContent)).toEqual(["Copy"]);
    act(() => buttons[0].click());
    expect(onActionSelect).toHaveBeenCalledWith("copy");

    act(() => toolbar.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]')!.click());
    expect(onSelect.mock.calls.map(([i]) => i)).toEqual([0, 1]);
  });

  it("selects only that row when its ⋮ menu opens, and offers the selection's actions", () => {
    const onSelect = vi.fn();
    render(
      hostAt("Global/"),
      <>
        <ActionsMenu items={[{ actionType: "copy", label: "Copy" }, { actionType: "upload", label: "Upload" }]} />
        <FileTable {...listProps([true, false, false], onSelect)} />
      </>,
    );
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Actions for file 2"]')!.click());
    // Row 0 is deselected and row 2 selected.
    expect(onSelect.mock.calls.map(([i]) => i)).toEqual([0, 2]);
    const menu = container.querySelector('[role="menu"][aria-label="Actions for file 2"]')!;
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(["Copy"]);
  });

  it("has no row menus or toolbar inside an action's view", () => {
    render(hostAt("Global/", "copy"), <FileTable {...listProps([true], () => {})} />);
    expect(container.querySelector('[role="toolbar"]')).toBeNull();
    expect(container.querySelector(".file-table__row-menu")).toBeNull();
  });

  it("names the location instead of Home and the bucket path in the breadcrumb", () => {
    const toFolder = vi.fn();
    render(
      hostAt("Personal/a@x.com/"),
      <Breadcrumb
        items={[
          { name: "Home", onNavigate: vi.fn() },
          { name: "bucket/Personal/a@x.com", onNavigate: toFolder },
          { name: "receipts", isCurrent: true },
        ]}
      />,
    );
    const crumbs = [...container.querySelectorAll(".breadcrumb__link, .breadcrumb__current")].map((c) => c.textContent);
    expect(crumbs).toEqual(["My files", "receipts"]);
    act(() => container.querySelector<HTMLButtonElement>(".breadcrumb__link")!.click());
    expect(toFolder).toHaveBeenCalled();
  });
});
