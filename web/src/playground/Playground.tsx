import { useState } from "react";
import { PREVIEW_TYPES, MAX_PREVIEW_BYTES, previewDisplayText } from "../preview/registry";
import samplePdfUrl from "./sample.pdf?url";
import { sampleMarkdown } from "./samples";

/*
 * Dev-only playground: renders this app's own preview viewers with local
 * sample files, no AWS or sign-in. Open http://localhost:5173/playground.html
 * while `npm run dev` runs. Photo, video and plain-text previews are Storage
 * Browser's built-in viewers and only appear in the real app.
 */


const samples = [
  { name: "Tết 2026 plan.md", type: "markdown", url: `data:text/markdown;charset=utf-8,${encodeURIComponent(sampleMarkdown)}`, size: sampleMarkdown.length },
  { name: "sample.pdf (3 pages)", type: "pdf", url: samplePdfUrl, size: 1200 },
  { name: "holiday-video.mp4 (120 MB)", type: "too-big", url: "", size: 120 * 1024 * 1024 },
];

function TooBig() {
  const text = previewDisplayText.LocationDetailView.filePreview;
  return (
    <div className="preview-status">
      <strong>{text.sizeLimitMessage}</strong>
      <p>{text.fileSizeLimitDescription}</p>
      <p>
        <em>(Storage Browser renders this with its own layout and a download button; wording shown here.)</em>
      </p>
    </div>
  );
}

export default function Playground() {
  const [active, setActive] = useState(0);
  const sample = samples[active];
  const entry = PREVIEW_TYPES.find((e) => e.type === sample.type);
  const Renderer = entry?.renderer;

  return (
    <div className="drive">
      <header className="topbar">
        <strong>Family Drive</strong>
        <span>· preview playground (dev only)</span>
        <span className="spacer" />
        <a href="?view=drive">Drive layout (sample data)</a>
        <span>limit {MAX_PREVIEW_BYTES / 1024 / 1024} MB</span>
      </header>
      <main className="playground">
        <ul className="playground-list">
          {samples.map((s, i) => (
            <li key={s.name}>
              <button type="button" className={i === active ? "link active" : "link"} onClick={() => setActive(i)}>
                {s.name}
              </button>
            </li>
          ))}
        </ul>
        <section className="playground-panel">
          <h3>{sample.name}</h3>
          {sample.size > MAX_PREVIEW_BYTES || !Renderer ? (
            <TooBig />
          ) : (
            <Renderer url={sample.url} fileData={{ key: `Global/${sample.name}`, size: sample.size }} />
          )}
        </section>
      </main>
    </div>
  );
}
