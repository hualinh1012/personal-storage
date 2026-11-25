import { useEffect, useState } from "react";
import { useDriveHost } from "../driveHost/hostContext";
import type { BrowserParts } from "../driveHost/storageBrowser";
import { warnOnLeave } from "../googleImport/leaveWarning";
import { fileName, type TextFormat } from "./text";
import { openText, saveText, type TextFileStorage } from "./textFile";

/*
 * The Edit screen (issue #45): a plain-text editor for one selected .txt file.
 * Save overwrites the file (last save wins; versioning keeps the old text).
 * It finds the selected file through Storage Browser's Delete view state, the
 * same way Restore does. Its storage comes from the feature (feature.ts), and
 * leaving goes through the host (`exitToFolder` remounts the browser, which re-lists the folder).
 */

type Phase =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "editing"; saved: string; text: string; format: TextFormat; saving: boolean; status?: { error: boolean; message: string } };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function makeEditTextView({ useView }: Pick<BrowserParts, "useView">, storage: TextFileStorage) {
  return function EditTextView() {
    const { exitToFolder } = useDriveHost();
    const key = (useView("Delete").tasks[0]?.data as { key?: string } | undefined)?.key;
    const [phase, setPhase] = useState<Phase>({ kind: "loading" });

    useEffect(() => {
      if (!key) return;
      let live = true;
      openText(key, storage).then(
        ({ text, format }) => live && setPhase({ kind: "editing", saved: text, text, format, saving: false }),
        (error) => live && setPhase({ kind: "failed", message: messageOf(error) }),
      );
      return () => {
        live = false;
      };
    }, [key]);

    const dirty = phase.kind === "editing" && phase.text !== phase.saved;
    useEffect(() => (dirty ? warnOnLeave() : undefined), [dirty]);

    if (!key) {
      return (
        <Frame title="Edit" onBack={exitToFolder}>
          <p>Select one text file to edit.</p>
        </Frame>
      );
    }

    const back = () => {
      if (dirty && !window.confirm("Discard your changes?")) return;
      exitToFolder();
    };

    const save = async () => {
      if (phase.kind !== "editing") return;
      const { text, format } = phase;
      setPhase({ ...phase, saving: true, status: undefined });
      try {
        await saveText(key, text, format, storage);
        setPhase((p) => (p.kind === "editing" ? { ...p, saved: text, saving: false, status: { error: false, message: "Saved." } } : p));
      } catch (error) {
        setPhase((p) =>
          p.kind === "editing" ? { ...p, saving: false, status: { error: true, message: `Couldn't save: ${messageOf(error)}` } } : p,
        );
      }
    };

    return (
      <Frame
        title={`Edit ${fileName(key)}`}
        onBack={back}
        saveButton={
          phase.kind === "editing" && (
            <button
              type="button"
              className="amplify-button amplify-button--primary"
              disabled={!dirty || phase.saving}
              onClick={save}
            >
              {phase.saving ? "Saving…" : "Save"}
            </button>
          )
        }
        status={phase.kind === "editing" ? phase.status : undefined}
      >
        {phase.kind === "loading" && <p>Opening…</p>}
        {phase.kind === "failed" && <p className="edit-text__error">Couldn't open the file: {phase.message}</p>}
        {phase.kind === "editing" && (
          <textarea
            className="edit-text__area"
            aria-label={`Contents of ${fileName(key)}`}
            value={phase.text}
            spellCheck={false}
            disabled={phase.saving}
            onChange={(e) => setPhase({ ...phase, text: e.target.value, status: undefined })}
          />
        )}
      </Frame>
    );
  };
}

function Frame({
  title,
  onBack,
  saveButton,
  status,
  children,
}: {
  title: string;
  onBack(): void;
  saveButton?: React.ReactNode;
  status?: { error: boolean; message: string };
  children: React.ReactNode;
}) {
  return (
    <div className="amplify-storage-browser edit-text">
      <h2 className="amplify-storage-browser__title edit-text__title">{title}</h2>
      <div className="edit-text__body">{children}</div>
      <div className="amplify-storage-browser__footer">
        {status && (
          <p className={status.error ? "edit-text__error" : "edit-text__saved"} role="status">
            {status.message}
          </p>
        )}
        <div className="amplify-storage-browser__buttons">
          <button type="button" className="amplify-button" onClick={onBack}>
            Back
          </button>
          {saveButton}
        </div>
      </div>
    </div>
  );
}
