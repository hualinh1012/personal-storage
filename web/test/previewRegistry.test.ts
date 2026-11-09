import { describe, expect, it, vi } from "vitest";

// Records whether anything imported react-pdf (it should only load on demand).
let pdfLibraryLoaded = false;
vi.mock("react-pdf", () => {
  pdfLibraryLoaded = true;
  return { Document: () => null, Page: () => null, pdfjs: { GlobalWorkerOptions: {} } };
});

import { filePreviewConfig, MAX_PREVIEW_BYTES, previewDisplayText, resolvePreviewType } from "../src/preview/registry";
import MarkdownPreview from "../src/preview/MarkdownPreview";
import PdfPreviewLazy from "../src/preview/PdfPreviewLazy";

const file = (key: string, contentType?: string) => ({ key, contentType });

describe("resolvePreviewType", () => {
  it("recognises Markdown by extension, case-insensitively", () => {
    expect(resolvePreviewType(file("Global/README.md"))).toBe("markdown");
    expect(resolvePreviewType(file("Global/notes/Plan.MARKDOWN"))).toBe("markdown");
  });

  it("recognises Markdown by content type when there is no known extension", () => {
    expect(resolvePreviewType(file("Global/notes", "text/markdown; charset=utf-8"))).toBe("markdown");
  });

  it("leaves photos, videos and text to Storage Browser's built-in detection", () => {
    expect(resolvePreviewType(file("Global/a.jpg", "image/jpeg"))).toBeUndefined();
    expect(resolvePreviewType(file("Global/b.mp4", "video/mp4"))).toBeUndefined();
    expect(resolvePreviewType(file("Global/c.txt", "text/plain"))).toBeUndefined();
  });

  it("recognises PDF by extension or content type", () => {
    expect(resolvePreviewType(file("Global/Contract.PDF"))).toBe("pdf");
    expect(resolvePreviewType(file("Global/scan", "application/pdf"))).toBe("pdf");
  });

  it("returns nothing for types without a viewer", () => {
    expect(resolvePreviewType(file("Global/d.docx"))).toBeUndefined();
    expect(resolvePreviewType(file("Global/e.zip", "application/zip"))).toBeUndefined();
    expect(resolvePreviewType(file("Global/no-extension"))).toBeUndefined();
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

  it("limits every preview type, built-in or ours, to 50 MB (bytes)", () => {
    const fiftyMb = 50 * 1024 * 1024;
    expect(MAX_PREVIEW_BYTES).toBe(fiftyMb);
    for (const type of ["image", "video", "text", "markdown", "pdf", "something-new"]) {
      expect(filePreviewConfig.maxFileSize(type)).toBe(fiftyMb);
    }
  });

  it("tells people a too-large file can't be previewed", () => {
    const text = previewDisplayText.LocationDetailView.filePreview;
    expect(text.sizeLimitMessage).toBe("File is too big to preview");
    expect(text.fileSizeLimitDescription).toContain("50 MB");
  });

  it("doesn't load the PDF library until a PDF is previewed", () => {
    expect(pdfLibraryLoaded).toBe(false);
  });
});
