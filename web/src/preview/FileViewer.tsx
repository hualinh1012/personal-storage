import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { positionOf, useOpenFileMode, useOpenFileStore } from "../driveHost/openFile";
import { Icon } from "../theme/Icon";
import { extensionOf, fileName, folderOf, formatSize, positionText } from "./fileInfo";
import { filePreviewConfig, previewDisplayText } from "./registry";

/*
 * Storage Browser's `FilePreview` slot, drawn our way:
 * a click on a file's name opens it full screen in a popup, with Previous and
 * Next (buttons, ← and →) through the page's files, Download and Close (Esc).
 * ⋮ → View info opens the panel beside the list instead: the file's details,
 * Download, and Open (the popup). Storage Browser still decides which file is
 * open, fetches its properties and a short-lived URL, and applies the size
 * limit; this only draws it. Typings mirror @aws-amplify/ui-react-storage
 * 3.18.4's FilePreview props.
 */

interface FileData {
  key: string;
  size?: number;
  contentType?: string;
  lastModified?: Date;
  fileType?: string;
}
export interface FileViewerProps {
  filePreview?: {
    enabled: boolean;
    isLoading?: boolean;
    ok?: boolean;
    error?: "LIMIT_EXCEEDED" | "GENERIC_ERROR";
    url?: string;
    fileData?: FileData;
  };
  activeFile?: FileData & { id: string };
  activeFileHasNext?: boolean;
  activeFileHasPrev?: boolean;
  onSelectActiveFile?: (arg?: "next" | "prev") => void;
  onRetryFilePreview?: () => void;
}

const text = previewDisplayText.LocationDetailView.filePreview;

export function FileViewer(props: FileViewerProps) {
  const mode = useOpenFileMode();
  const { activeFile, filePreview } = props;
  if (!activeFile || !filePreview?.enabled) return null;
  return mode === "info" ? <InfoPanel {...props} activeFile={activeFile} /> : <ViewerDialog {...props} activeFile={activeFile} />;
}

type OpenProps = FileViewerProps & { activeFile: NonNullable<FileViewerProps["activeFile"]> };

/** The open file's details: the listing's, enriched with its properties once Storage Browser has them. */
function detailsOf({ activeFile, filePreview }: OpenProps): FileData {
  return { ...activeFile, ...filePreview?.fileData };
}

/** Download through the row's own download (Storage Browser's, with its progress), else the preview URL. */
function DownloadButton({ id, url, name, compact }: { id: string; url?: string; name: string; compact?: boolean }) {
  const store = useOpenFileStore();
  const download = store.getFiles().find((f) => f.id === id)?.download;
  const label = `Download ${name}`;
  const content = (
    <>
      <Icon name="download" />
      <span className={compact ? "viewer__download-text" : undefined}>Download</span>
    </>
  );
  if (download)
    return (
      <button type="button" className="primary button--with-icon" aria-label={label} onClick={download}>
        {content}
      </button>
    );
  if (url)
    return (
      <a className="primary button--with-icon button-link" aria-label={label} href={url} download={name}>
        {content}
      </a>
    );
  return null;
}

function ViewerDialog(props: OpenProps) {
  const { activeFile, filePreview, activeFileHasNext, activeFileHasPrev, onSelectActiveFile } = props;
  const store = useOpenFileStore();
  const details = detailsOf(props);
  const name = fileName(details.key);
  const close = () => onSelectActiveFile?.(undefined);
  const prev = () => activeFileHasPrev && onSelectActiveFile?.("prev");
  const next = () => activeFileHasNext && onSelectActiveFile?.("next");

  // Keys while it's open: ← and → move through the files, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape") onSelectActiveFile?.(undefined);
      else if (e.key === "ArrowLeft" && activeFileHasPrev) onSelectActiveFile?.("prev");
      else if (e.key === "ArrowRight" && activeFileHasNext) onSelectActiveFile?.("next");
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeFileHasPrev, activeFileHasNext, onSelectActiveFile]);

  // Focus moves into the popup when it opens.
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => closeButton.current?.focus(), []);

  const meta = [formatSize(details.size), details.lastModified?.toLocaleString(), positionText(positionOf(store.getFiles(), activeFile.id))].filter(Boolean);

  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={name}>
      <header className="viewer__bar">
        <button ref={closeButton} type="button" className="icon-button" aria-label="Close" onClick={close}>
          <Icon name="close" />
        </button>
        <div className="viewer__title">
          <span className="viewer__name" title={name}>
            {name}
          </span>
          <span className="viewer__meta">{meta.join(" · ")}</span>
        </div>
        <DownloadButton id={activeFile.id} url={filePreview?.url} name={name} compact />
      </header>
      <div className="viewer__stage">
        <button type="button" className="icon-button viewer__nav viewer__nav--prev" aria-label="Previous file" disabled={!activeFileHasPrev} onClick={prev}>
          <Icon name="chevron_left" />
        </button>
        <div className="viewer__content">
          <ViewerContent {...props} name={name} />
        </div>
        <button type="button" className="icon-button viewer__nav viewer__nav--next" aria-label="Next file" disabled={!activeFileHasNext} onClick={next}>
          <Icon name="chevron_right" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** What the popup shows for the file: loading, a message, or the file in its viewer. */
function ViewerContent({ activeFile, filePreview, onRetryFilePreview, name }: OpenProps & { name: string }) {
  if (!filePreview || filePreview.isLoading) return <div className="spinner viewer__spinner" role="status" aria-label="Loading" />;
  if (!filePreview.ok) {
    if (filePreview.error === "LIMIT_EXCEEDED")
      return <ViewerMessage icon="description" title={text.sizeLimitMessage} body={text.fileSizeLimitDescription} />;
    return (
      <ViewerMessage icon="error" title="This file couldn't be loaded" body="Check your connection and try again.">
        <button type="button" className="outlined" onClick={() => onRetryFilePreview?.()}>
          Try again
        </button>
      </ViewerMessage>
    );
  }
  const url = filePreview.url ?? "";
  const data = filePreview.fileData ?? activeFile;
  const type = data.fileType;
  // A registry viewer (Markdown, PDF): a module-level component, looked up by type.
  const custom = type ? filePreviewConfig.rendererResolver(type) : undefined;
  if (custom) return <div className="viewer__sheet">{createElement(custom, { url, fileData: data })}</div>;
  switch (type) {
    case "image":
      return <img className="viewer__media" src={url} alt={name} />;
    case "video":
      // Family videos come without caption files; there's nothing to put in a <track>.
      // oxlint-disable-next-line jsx-a11y/media-has-caption
      return <video className="viewer__media" src={url} controls />;
    case "text":
      return (
        <div className="viewer__sheet">
          <TextView key={url} url={url} />
        </div>
      );
    default:
      return <ViewerMessage icon="draft" title="No preview for this type of file" body="Download the file to open it." />;
  }
}

function ViewerMessage({ icon, title, body, children }: { icon: string; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="viewer__message">
      <Icon name={icon} className="viewer__message-icon" />
      <p className="viewer__message-title">{title}</p>
      <p>{body}</p>
      {children}
    </div>
  );
}

type TextState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; text: string };

/** A text file as plain text. Keyed by URL, so a new file starts again from "loading". */
function TextView({ url }: { url: string }) {
  const [state, setState] = useState<TextState>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((t) => setState({ kind: "ready", text: t }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      });
    return () => controller.abort();
  }, [url]);
  if (state.kind === "loading") return <div className="spinner" role="status" aria-label="Loading" />;
  if (state.kind === "error") return <p>This file couldn't be loaded.</p>;
  return <pre className="viewer__text">{state.text}</pre>;
}

/** ⋮ → View info: the panel beside the list with the file's details. */
function InfoPanel(props: OpenProps) {
  const { activeFile, filePreview, onSelectActiveFile } = props;
  const store = useOpenFileStore();
  const details = detailsOf(props);
  const name = fileName(details.key);
  const rows: [string, string][] = [
    ["Name", name],
    ["Folder", folderOf(details.key) || "/"],
    ["Size", formatSize(details.size)],
    ["Type", extensionOf(details.key) ?? "None"],
    ["Last modified", details.lastModified?.toLocaleString() ?? "Unknown"],
  ];
  return (
    // Storage Browser's class, so the list makes room for the panel as it did for the preview.
    <aside className="amplify-storage-browser__file-preview file-info" aria-label={`Information about ${name}`}>
      <div className="file-info__header">
        <h2 className="file-info__title">File information</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={() => onSelectActiveFile?.(undefined)}>
          <Icon name="close" />
        </button>
      </div>
      <dl className="file-info__list">
        {rows.map(([label, value]) => (
          <div key={label} className="file-info__item">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="file-info__actions">
        <button type="button" className="outlined button--with-icon" onClick={() => store.setMode("viewer")}>
          <Icon name="open_in_full" />
          Open
        </button>
        <DownloadButton id={activeFile.id} url={filePreview?.url} name={name} />
      </div>
    </aside>
  );
}
