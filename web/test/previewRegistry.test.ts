import { describe, expect, it } from "vitest";
import { filePreviewConfig, resolvePreviewType } from "../src/preview/registry";
import MarkdownPreview from "../src/preview/MarkdownPreview";

const file = (key: string, contentType?: string) => ({ key, contentType });

describe("resolvePreviewType", () => {
  it("recognises Markdown by extension, case-insensitively", () => {
    expect(resolvePreviewType(file("drive/README.md"))).toBe("markdown");
    expect(resolvePreviewType(file("drive/notes/Plan.MARKDOWN"))).toBe("markdown");
  });

  it("recognises Markdown by content type when there is no known extension", () => {
    expect(resolvePreviewType(file("drive/notes", "text/markdown; charset=utf-8"))).toBe("markdown");
  });

  it("leaves photos, videos and text to Storage Browser's built-in detection", () => {
    expect(resolvePreviewType(file("drive/a.jpg", "image/jpeg"))).toBeUndefined();
    expect(resolvePreviewType(file("drive/b.mp4", "video/mp4"))).toBeUndefined();
    expect(resolvePreviewType(file("drive/c.txt", "text/plain"))).toBeUndefined();
  });

  it("returns nothing for types without a viewer", () => {
    expect(resolvePreviewType(file("drive/d.pdf", "application/pdf"))).toBeUndefined();
    expect(resolvePreviewType(file("drive/no-extension"))).toBeUndefined();
  });
});

describe("filePreviewConfig", () => {
  it("uses the Markdown viewer for markdown and built-in viewers otherwise", () => {
    expect(filePreviewConfig.rendererResolver("markdown")).toBe(MarkdownPreview);
    expect(filePreviewConfig.rendererResolver("image")).toBeUndefined();
    expect(filePreviewConfig.rendererResolver("video")).toBeUndefined();
    expect(filePreviewConfig.rendererResolver("text")).toBeUndefined();
  });

  it("caps Markdown previews at 10 MB (bytes) and keeps built-in limits otherwise", () => {
    expect(filePreviewConfig.maxFileSize("markdown")).toBe(10 * 1024 * 1024);
    expect(filePreviewConfig.maxFileSize("image")).toBeUndefined();
  });
});
