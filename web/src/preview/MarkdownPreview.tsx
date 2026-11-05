import { useEffect, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import type { FilePreviewProps } from "./types";

/*
 * Safety: files are uploaded by family members and rendered in everyone's
 * browser, which holds AWS credentials for the drive. So:
 *  - skipHtml: raw HTML in the file is dropped, never turned into elements;
 *  - react-markdown's default urlTransform strips javascript:/data: style links;
 *  - images are shown as links and never loaded (no tracking pixels).
 */
const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noopener noreferrer">
      {alt || "image"}
    </a>
  ),
};

export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="markdown-preview">
      <Markdown skipHtml components={components}>
        {source}
      </Markdown>
    </div>
  );
}

type State = { kind: "loading" } | { kind: "error" } | { kind: "ready"; source: string };

/** Storage Browser renderer for the "markdown" preview type. */
export default function MarkdownPreview({ url }: FilePreviewProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((source) => setState({ kind: "ready", source }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      });
    return () => controller.abort();
  }, [url]);

  if (state.kind === "loading") return <p className="preview-status">Loading preview…</p>;
  if (state.kind === "error") return <p className="preview-status">Couldn't load this file. Try downloading it.</p>;
  return <MarkdownView source={state.source} />;
}
