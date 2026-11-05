import { lazy, Suspense } from "react";
import type { FilePreviewProps } from "./types";

// PDF.js is large; load it (and its worker) only when a PDF is first previewed.
const PdfPreview = lazy(() => import("./PdfPreview"));

export default function PdfPreviewLazy(props: FilePreviewProps) {
  return (
    <Suspense fallback={<p className="preview-status">Loading PDF viewer…</p>}>
      <PdfPreview {...props} />
    </Suspense>
  );
}
