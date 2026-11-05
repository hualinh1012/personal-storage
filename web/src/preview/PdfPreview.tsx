import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { FilePreviewProps } from "./types";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

/*
 * The pre-signed URL Storage Browser gives us is "Content-Disposition:
 * attachment", so an <iframe>/<embed> would download instead of display.
 * PDF.js fetches the bytes (allowed by the files bucket CORS rule) and draws
 * the pages itself. It doesn't run JavaScript embedded in PDFs; XFA forms and
 * the annotation/text layers (clickable links, form fields) are left off.
 */
export default function PdfPreview({ url }: FilePreviewProps) {
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState<number>();
  const box = useRef<HTMLDivElement>(null);
  const options = useMemo(() => ({ enableXfa: false }), []);

  useEffect(() => {
    setPage(1);
    setPages(0);
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="pdf-preview" ref={box}>
      <Document
        file={url}
        options={options}
        suspense={false}
        onLoadSuccess={(pdf) => setPages(pdf.numPages)}
        loading={<p className="preview-status">Loading PDF…</p>}
        error={<p className="preview-status">Couldn't open this PDF. Try downloading it.</p>}
      >
        <Page pageNumber={page} width={width} renderTextLayer={false} renderAnnotationLayer={false} />
      </Document>
      {pages > 1 && (
        <div className="pdf-pager">
          <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= pages}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
