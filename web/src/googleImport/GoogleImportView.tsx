import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { GoogleImportDeps } from "./deps";
import { importItem } from "./importFile";
import type { ImportItem } from "./plan";
import { prepareImport, type PreparedImport } from "./prepare";
import { runQueue } from "./queue";
import { STATUS_LABEL, formatBytes, summaryLine } from "./summary";

/** What DriveView hands the import view: the open folder and how to leave. */
export interface GoogleImportContextValue {
  deps: GoogleImportDeps;
  /** Destination prefix, e.g. "Global/linh/". */
  prefix: string;
  /** The open folder as people see it. */
  folderLabel: string;
  /** Leave the view (DriveView remounts the browser, which refreshes the list). */
  onExit(): void;
}

export const GoogleImportContext = createContext<GoogleImportContextValue | null>(null);

const CONCURRENCY = 3;

type Phase =
  | { kind: "choose"; error?: string }
  | { kind: "preparing" }
  | { kind: "ready"; plan: PreparedImport }
  | { kind: "running"; items: ImportItem[] }
  | { kind: "finished"; items: ImportItem[] };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Frame({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  return (
    <div className="amplify-storage-browser google-import">
      <h2 className="amplify-storage-browser__title">Import from Google Drive</h2>
      <div className="google-import__body">{children}</div>
      <div className="amplify-storage-browser__footer">
        <div className="amplify-storage-browser__buttons">{footer}</div>
      </div>
    </div>
  );
}

function Button({ primary, ...props }: { primary?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`amplify-button${primary ? " amplify-button--primary" : ""}`} {...props} />;
}

function ItemsTable({ items }: { items: ImportItem[] }) {
  return (
    <table className="google-import__table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Size</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => (
          <tr key={it.id} className={`google-import__row--${it.status}`}>
            <td className="google-import__name">{it.kind === "folder" ? `${it.path} (empty folder)` : it.path}</td>
            <td>{it.size != null ? formatBytes(it.size) : ""}</td>
            <td>
              {STATUS_LABEL[it.status]}
              {it.reason && <div className="google-import__reason">{it.reason}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The ⋮ menu's and the top bar's "Import from Google Drive" screen. */
export function GoogleImportView() {
  const ctx = useContext(GoogleImportContext);
  if (!ctx) throw new Error("GoogleImportView needs GoogleImportContext");
  const { deps, prefix, folderLabel, onExit } = ctx;
  const { config, google, storage } = deps;

  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const [loadError, setLoadError] = useState<string>();
  const token = useRef<string>(undefined);
  const abort = useRef<AbortController>(undefined);

  // Load Google's scripts as soon as the view opens, so the sign-in popup can
  // open straight from the click (browsers block popups opened later).
  useEffect(() => {
    if (config) google.load().catch((e) => setLoadError(message(e)));
  }, [config, google]);
  // Leaving the view mid-import cancels it.
  useEffect(() => () => abort.current?.abort(), []);

  if (!config) {
    return (
      <Frame footer={<Button onClick={onExit}>Back</Button>}>
        <p>Import from Google Drive isn't set up yet.</p>
      </Frame>
    );
  }

  const choose = async () => {
    try {
      token.current = await google.token(config.clientId);
      const files = await google.pick(config, token.current);
      if (files.length === 0) return;
      setPhase({ kind: "preparing" });
      const plan = await prepareImport(files, prefix, {
        drive: google.drive(token.current),
        listExisting: storage.list,
      });
      setPhase({ kind: "ready", plan });
    } catch (e) {
      setPhase({ kind: "choose", error: message(e) });
    }
  };

  const start = async (items: ImportItem[]) => {
    const ac = new AbortController();
    abort.current = ac;
    setPhase({ kind: "running", items });
    const drive = google.drive(token.current!);
    const ops = {
      exists: storage.exists,
      upload: storage.upload,
      download: (id: string, signal: AbortSignal) => drive.download(id, signal),
      exportFile: (id: string, mimeType: string, signal: AbortSignal) => drive.exportFile(id, mimeType, signal),
    };
    const final = await runQueue(items, (it, signal) => importItem(it, ops, signal), {
      concurrency: CONCURRENCY,
      signal: ac.signal,
      onChange: (next) => setPhase({ kind: "running", items: next }),
    });
    setPhase({ kind: "finished", items: final });
  };

  switch (phase.kind) {
    case "choose":
      return (
        <Frame
          footer={
            <>
              <Button onClick={onExit}>Back</Button>
              <Button primary disabled={!!loadError} onClick={choose}>
                Choose from Google Drive
              </Button>
            </>
          }
        >
          <p>
            Pick files in your Google Drive to copy into <strong>{folderLabel}</strong>. Nothing is changed in Google
            Drive, and files already here aren't overwritten.
          </p>
          {(loadError || phase.error) && <p className="google-import__error">{loadError ?? phase.error}</p>}
        </Frame>
      );

    case "preparing":
      return (
        <Frame footer={<Button onClick={onExit}>Back</Button>}>
          <p>Looking through the picked folders and what's already in {folderLabel}…</p>
        </Frame>
      );

    case "ready": {
      const { items, pickedFiles, pickedFolders } = phase.plan;
      const toCopy = items.filter((i) => i.status === "queued" && i.kind === "file").length;
      const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
      return (
        <Frame
          footer={
            <>
              <Button onClick={onExit}>Back</Button>
              <Button onClick={choose}>Choose again</Button>
              <Button primary disabled={!items.some((i) => i.status === "queued")} onClick={() => start(items)}>
                Start
              </Button>
            </>
          }
        >
          <p>
            {plural(pickedFiles, "file")}, {plural(pickedFolders, "folder")} selected → into <strong>{folderLabel}</strong>
            {" · "}
            {plural(toCopy, "file")} to copy
          </p>
          <ItemsTable items={items} />
        </Frame>
      );
    }

    case "running":
      return (
        <Frame footer={<Button onClick={() => abort.current?.abort()}>Cancel</Button>}>
          <p className="google-import__summary">{summaryLine(phase.items)}</p>
          <ItemsTable items={phase.items} />
        </Frame>
      );

    case "finished":
      return (
        <Frame
          footer={
            <Button primary onClick={onExit}>
              Done
            </Button>
          }
        >
          <p className="google-import__summary">Finished: {summaryLine(phase.items)}</p>
          <ItemsTable items={phase.items} />
        </Frame>
      );
  }
}
