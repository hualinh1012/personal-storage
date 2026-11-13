import { createContext, useContext, useEffect, useState } from "react";
import { warnOnLeave } from "../googleImport/leaveWarning";
import { fileName, type TextFormat } from "./text";
import { openText, saveText, type TextFileOps } from "./textFile";

/*
 * The Edit screen (issue #45): a plain-text editor for one selected .txt file.
 * Save overwrites the file (last save wins; versioning keeps the old text).
 * It finds the selected file through Storage Browser's Delete view state, the
 * same way Restore does, and gets its S3 ops and exit from EditTextContext.
 */

export interface EditTextContextValue {
  ops(): Promise<TextFileOps>;
  /** Back to the folder (DriveView remounts the browser, which re-lists it). */
  onExit(): void;
}

export const EditTextContext = createContext<EditTextContextValue | null>(null);

// Loose shape of the Storage Browser state we read (its typings are internal).
interface SelectionState {
  tasks: { data: { key: string } }[];
}

export interface EditTextViewDeps {
  useView: (name: "Delete") => SelectionState;
}

type Phase =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "editing"; saved: string; text: string; format: TextFormat; saving: boolean; status?: { error: boolean; message: string } };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function makeEditTextView({ useView }: EditTextViewDeps) {
  return function EditTextView() {
    const ctx = useContext(EditTextContext);
    const key = useView("Delete").tasks[0]?.data.key;
    const [phase, setPhase] = useState<Phase>({ kind: "loading" });

    useEffect(() => {
      if (!ctx || !key) return;
      let live = true;
      ctx
        .ops()
        .then((ops) => openText(key, ops))
        .then(
          ({ text, format }) => live && setPhase({ kind: "editing", saved: text, text, format, saving: false }),
          (error) => live && setPhase({ kind: "failed", message: messageOf(error) }),
        );
      return () => {
        live = false;
      };
    }, [ctx, key]);

    const dirty = phase.kind === "editing" && phase.text !== phase.saved;
    useEffect(() => (dirty ? warnOnLeave() : undefined), [dirty]);

    if (!ctx) return null;
    if (!key) {
      return (
        <Frame title="Edit" onBack={ctx.onExit}>
          <p>Select one text file to edit.</p>
        </Frame>
      );
    }

    const back = () => {
      if (dirty && !window.confirm("Discard your changes?")) return;
      ctx.onExit();
    };

    const save = async () => {
      if (phase.kind !== "editing") return;
      const { text, format } = phase;
      setPhase({ ...phase, saving: true, status: undefined });
      try {
        await saveText(key, text, format, await ctx.ops());
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
