import { describe, expect, it, vi } from "vitest";

// Records whether anything imported react-pdf (it should only load on demand).
let pdfLibraryLoaded = false;
vi.mock("react-pdf", () => {
  pdfLibraryLoaded = true;
  return { Document: () => null, Page: () => null, pdfjs: { GlobalWorkerOptions: {} } };
});

import { filePreviewConfig, resolvePreviewType } from "../src/preview/registry";
import MarkdownPreview from "../src/preview/MarkdownPreview";
import PdfPreviewLazy from "../src/preview/PdfPreviewLazy";

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

  it("recognises PDF by extension or content type", () => {
    expect(resolvePreviewType(file("drive/Contract.PDF"))).toBe("pdf");
    expect(resolvePreviewType(file("drive/scan", "application/pdf"))).toBe("pdf");
  });

  it("returns nothing for types without a viewer", () => {
    expect(resolvePreviewType(file("drive/d.docx"))).toBeUndefined();
    expect(resolvePreviewType(file("drive/e.zip", "application/zip"))).toBeUndefined();
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

  it("uses the lazily loaded PDF viewer for pdf", () => {
    expect(filePreviewConfig.rendererResolver("pdf")).toBe(PdfPreviewLazy);
  });

  it("caps Markdown at 10 MB and PDF at 50 MB (bytes), keeping built-in limits otherwise", () => {
    expect(filePreviewConfig.maxFileSize("markdown")).toBe(10 * 1024 * 1024);
    expect(filePreviewConfig.maxFileSize("pdf")).toBe(50 * 1024 * 1024);
    expect(filePreviewConfig.maxFileSize("image")).toBeUndefined();
  });

  it("doesn't load the PDF library until a PDF is previewed", () => {
    expect(pdfLibraryLoaded).toBe(false);
  });
});
