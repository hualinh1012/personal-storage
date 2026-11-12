import { describe, expect, it } from "vitest";
import { canEditSelection, decodeText, encodeText, isEditable, MAX_EDIT_BYTES } from "../src/edit/text";
import { openText, saveText, type TextFileOps } from "../src/edit/textFile";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("isEditable / canEditSelection", () => {
  it("offers Edit for one .txt file up to the size cap", () => {
    expect(isEditable({ key: "Global/notes.txt", type: "FILE", size: 10 })).toBe(true);
    expect(isEditable({ key: "Global/NOTES.TXT", type: "FILE", size: MAX_EDIT_BYTES })).toBe(true);
    expect(canEditSelection([{ key: "Global/a.txt", type: "FILE", size: 1 }])).toBe(true);
  });

  it("refuses other types, folders, big files and anything but a single selection", () => {
    expect(isEditable({ key: "Global/plan.md", type: "FILE", size: 1 })).toBe(false);
    expect(isEditable({ key: "Global/txt", type: "FILE", size: 1 })).toBe(false);
    expect(isEditable({ key: "Global/.txt", type: "FILE", size: 1 })).toBe(false);
    expect(isEditable({ key: "Global/old.txt/", type: "FOLDER" })).toBe(false);
    expect(isEditable({ key: "Global/big.txt", type: "FILE", size: MAX_EDIT_BYTES + 1 })).toBe(false);
    expect(canEditSelection(undefined)).toBe(false);
    expect(canEditSelection([])).toBe(false);
    expect(
      canEditSelection([
        { key: "Global/a.txt", type: "FILE", size: 1 },
        { key: "Global/b.txt", type: "FILE", size: 1 },
      ]),
    ).toBe(false);
  });
});

describe("decodeText / encodeText", () => {
  it("round-trips Vietnamese text with a BOM and CRLF byte for byte", () => {
    const original = bytes("﻿Tết 2026\r\nMua bánh chưng\r\n");
    const loaded = decodeText(original);
    expect(loaded.text).toBe("Tết 2026\nMua bánh chưng\n");
    expect(loaded.format).toEqual({ bom: true, eol: "\r\n" });
    expect(encodeText(loaded.text, loaded.format)).toEqual(original);
  });

  it("keeps LF files LF and adds no BOM", () => {
    const loaded = decodeText(bytes("a\nb"));
    expect(loaded.format).toEqual({ bom: false, eol: "\n" });
    expect(new TextDecoder().decode(encodeText(loaded.text + "\nc", loaded.format))).toBe("a\nb\nc");
  });

  it("writes new lines with the file's own line ending", () => {
    const loaded = decodeText(bytes("one\r\ntwo"));
    expect(new TextDecoder().decode(encodeText("one\ntwo\nthree", loaded.format))).toBe("one\r\ntwo\r\nthree");
  });

  it("treats an empty or single-line file as LF without a BOM", () => {
    expect(decodeText(new Uint8Array()).format).toEqual({ bom: false, eol: "\n" });
    expect(decodeText(bytes("hello")).text).toBe("hello");
  });

  it("refuses bytes that aren't UTF-8 instead of saving replacement characters", () => {
    expect(() => decodeText(new Uint8Array([0x54, 0xe9, 0x74]))).toThrow(/isn't UTF-8/);
  });
});

function memoryOps(initial: Record<string, Uint8Array>) {
  const store = new Map(Object.entries(initial));
  const puts: { key: string; contentType: string }[] = [];
  const ops: TextFileOps = {
    async read(key) {
      const body = store.get(key);
      if (!body) throw new Error("NoSuchKey");
      return body;
    },
    async write(key, body, contentType) {
      store.set(key, body);
      puts.push({ key, contentType });
    },
  };
  return { ops, store, puts };
}

describe("openText / saveText", () => {
  it("opens a file and saves the edit back to the same key as UTF-8 text", async () => {
    const { ops, store, puts } = memoryOps({ "Global/list.txt": bytes("﻿gạo\r\n") });
    const opened = await openText("Global/list.txt", ops);
    expect(opened.text).toBe("gạo\n");
    const size = await saveText("Global/list.txt", opened.text + "muối\n", opened.format, ops);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(store.get("Global/list.txt"))).toBe("﻿gạo\r\nmuối\r\n");
    expect(size).toBe(store.get("Global/list.txt")!.byteLength);
    expect(puts).toEqual([{ key: "Global/list.txt", contentType: "text/plain; charset=utf-8" }]);
  });

  it("refuses to open a file over the cap", async () => {
    const { ops } = memoryOps({ "Global/big.txt": new Uint8Array(1024 * 1024 + 1) });
    await expect(openText("Global/big.txt", ops)).rejects.toThrow(/too big to edit/);
  });
});
