import { describe, expect, it } from "vitest";
import { canEditSelection, decodeText, encodeText, isEditable, MAX_EDIT_BYTES } from "../src/edit/text";
import { openText, saveText } from "../src/edit/textFile";
import { memoryDriveStorage } from "../src/storage/memoryStorage";

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

describe("openText / saveText", () => {
  it("opens a file and saves the edit back to the same key as UTF-8 text", async () => {
    const drive = memoryDriveStorage([{ key: "Global/list.txt", body: bytes("﻿gạo\r\n"), contentType: "text/plain" }]);
    const opened = await openText("Global/list.txt", drive);
    expect(opened.text).toBe("gạo\n");
    const size = await saveText("Global/list.txt", opened.text + "muối\n", opened.format, drive);
    const saved = await drive.read("Global/list.txt");
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(saved)).toBe("﻿gạo\r\nmuối\r\n");
    expect(size).toBe(saved.byteLength);
    expect(drive.get("Global/list.txt")?.contentType).toBe("text/plain; charset=utf-8");
    // The old text is still a version (versioning is the undo).
    expect(await drive.listVersions("Global/list.txt")).toHaveLength(2);
  });

  it("refuses to open a file over the cap", async () => {
    const drive = memoryDriveStorage([{ key: "Global/big.txt", body: new Uint8Array(1024 * 1024 + 1) }]);
    await expect(openText("Global/big.txt", drive)).rejects.toThrow(/too big to edit/);
  });

  it("explains a file that's gone with the storage's not-found reason", async () => {
    await expect(openText("Global/gone.txt", memoryDriveStorage())).rejects.toThrow(/No such key/);
  });
});
