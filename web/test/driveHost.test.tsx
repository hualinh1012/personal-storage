// @vitest-environment jsdom
/**
 * The drive host (issue #40) with a fake Storage Browser: features plug in
 * without touching DriveView, and opening an action from the top bar or
 * leaving a feature's view remounts the browser at the open folder.
 */
import { act, useState, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Access } from "../src/access";
import { composeFeatures, type DriveFeature, type ListHandler } from "../src/driveHost/feature";
import { useDriveHost } from "../src/driveHost/hostContext";
import { DriveView } from "../src/driveHost/DriveView";
import type { BrowserInput, BrowserParts, BrowserProps, CreateBrowser } from "../src/driveHost/storageBrowser";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const access: Access = { globalWrite: true, personal: true, trash: true };
const list: ListHandler = async () => ({ items: [] });

describe("composeFeatures", () => {
  it("merges actions, display text per view, slots, top-bar buttons and notes in feature order", async () => {
    const calls: string[] = [];
    const wrap = (name: string) => (h: ListHandler): ListHandler => (input) => (calls.push(name), h(input));
    const composed = composeFeatures([
      { name: "a", customActions: { one: { viewName: "OneView" } }, displayText: { CopyView: { x: 1 } }, wrapList: wrap("a") },
      {
        name: "b",
        defaultActions: { delete: "custom delete" },
        customActions: { two: {} },
        displayText: { CopyView: { y: 2 }, DeleteView: { z: 3 } },
        wrapList: wrap("b"),
        topBar: [{ label: "Two", actionType: "two" }],
        note: (host) => (host.actionType ? null : "a note"),
      },
    ]);
    expect(Object.keys(composed.customActions)).toEqual(["one", "two"]);
    expect(composed.defaultActions).toEqual({ delete: "custom delete" });
    expect(composed.displayText).toEqual({ CopyView: { x: 1, y: 2 }, DeleteView: { z: 3 } });
    expect(composed.topBar.map((b) => b.actionType)).toEqual(["two"]);
    expect(composed.notes({} as never)).toEqual(["a note"]);
    await composed.wrapList(list)({ config: {}, prefix: "Global/" });
    // The last feature's wrapper is outermost.
    expect(calls).toEqual(["b", "a"]);
  });

  it("refuses two features that claim the same action, slot, top-bar action or view", () => {
    expect(() => composeFeatures([{ name: "a", customActions: { x: {} } }, { name: "b", defaultActions: { x: {} } }])).toThrow(
      'Features "a" and "b" both define action "x".',
    );
    const Slot = () => null;
    expect(() => composeFeatures([{ name: "a", components: { Pagination: Slot } }, { name: "b", components: { Pagination: Slot } }])).toThrow(
      /component "Pagination"/,
    );
    const views = () => ({ V: () => null });
    expect(() => composeFeatures([{ name: "a", views }, { name: "b", views }]).views({} as BrowserParts)).toThrow(/view "V"/);
  });
});

/** A stand-in for Storage Browser: records what the host gave it and renders the open action's view. */
function fakeBrowser() {
  let mounts = 0;
  const record = { inputs: [] as BrowserInput[], renders: [] as (BrowserProps & { mount: number })[], navigate: (_prefix: string) => {} };
  const parts = { marker: "parts" } as unknown as BrowserParts;
  const create: CreateBrowser = (input) => {
    record.inputs.push(input);
    const viewNameOf = (actionType?: string) =>
      (input.actions.custom[actionType ?? ""] as { viewName?: string } | undefined)?.viewName ?? "";
    function Browser(props: BrowserProps) {
      // A new instance only when the host remounts it (a new key).
      const [mount] = useState(() => ++mounts);
      record.renders.push({ ...props, mount });
      record.navigate = (prefix) => props.onValueChange({ location: { ...props.defaultValue.location!, prefix } } as never);
      const View: ComponentType | undefined = props.views[viewNameOf(props.defaultValue.actionType)];
      return <div data-testid="browser">{View ? <View /> : `list of ${props.defaultValue.location?.prefix}`}</div>;
    }
    return { Browser, parts };
  };
  return { create, record, parts };
}

describe("DriveView", () => {
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

  const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === label)!;

  it("builds the browser from the features and gives their views the browser's parts", () => {
    const { create, record, parts } = fakeBrowser();
    let seen: BrowserParts | undefined;
    const feature: DriveFeature = {
      name: "thing",
      customActions: { thing: { viewName: "ThingView" } },
      views: (p) => ((seen = p), { ThingView: () => null }),
      wrapList: (h) => h,
    };
    act(() => root.render(<DriveView email="a@x.com" access={access} bucket="b" setup={{ config: {} as never, listLocationItems: list }} features={[feature]} createBrowser={create} />));
    expect(seen).toBe(parts);
    expect(Object.keys(record.inputs[0].actions.custom)).toEqual(["thing"]);
    expect(Object.keys(record.renders[0].views)).toEqual(["ThingView"]);
    expect(container.textContent).toContain("list of Global/");
  });

  it("opens a top-bar action for the open folder by remounting, and exits back to that folder's list", () => {
    const { create, record } = fakeBrowser();
    function ThingView() {
      const host = useDriveHost();
      return (
        <button type="button" onClick={host.exitToFolder}>
          Done in {host.location?.prefix}
        </button>
      );
    }
    const feature: DriveFeature = {
      name: "thing",
      customActions: { thing: { viewName: "ThingView" } },
      views: () => ({ ThingView }),
      topBar: [{ label: "Do thing", actionType: "thing" }],
      note: (host) => (host.policy.kind === "shared" ? "Shared note" : null),
    };
    act(() => root.render(<DriveView email="a@x.com" access={access} bucket="b" setup={{ config: {} as never, listLocationItems: list }} features={[feature]} createBrowser={create} />));
    act(() => record.navigate("Global/photos/"));
    expect(container.querySelector(".folder-note")?.textContent).toBe("Shared note");

    const listed = record.renders.at(-1)!;
    act(() => button("Do thing").click());
    const opened = record.renders.at(-1)!;
    expect(opened.mount).toBe(listed.mount + 1);
    expect(opened.defaultValue).toMatchObject({ actionType: "thing", location: { prefix: "Global/photos/" } });
    expect(button("Do thing").disabled).toBe(true);
    // No note over an action's view.
    expect(container.querySelector(".folder-note")).toBeNull();

    act(() => button("Done in Global/photos/").click());
    const back = record.renders.at(-1)!;
    expect(back.mount).toBe(opened.mount + 1);
    expect(back.defaultValue.actionType).toBeUndefined();
    expect(back.defaultValue.location?.prefix).toBe("Global/photos/");
    expect(container.textContent).toContain("list of Global/photos/");
    expect(button("Do thing").disabled).toBe(false);
  });

  it("hides top-bar actions in a read-only location", () => {
    const { create, record } = fakeBrowser();
    const feature: DriveFeature = { name: "thing", topBar: [{ label: "Do thing", actionType: "thing" }] };
    const readOnly: Access = { globalWrite: false, personal: false, trash: false };
    act(() => root.render(<DriveView email="a@x.com" access={readOnly} bucket="b" setup={{ config: {} as never, listLocationItems: list }} features={[feature]} createBrowser={create} />));
    act(() => record.navigate("Global/photos/"));
    expect(button("Do thing")).toBeUndefined();
  });
});
