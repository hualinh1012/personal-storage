/**
 * Google sign-in for Drive (Google Identity Services token client) and Google
 * Picker. Both scripts load lazily, the first time the import view opens. The
 * access token lives only in this module's memory and goes only to Google.
 */
import type { GoogleImportConfig } from "../config";
import type { PickedFile } from "./plan";

/** ADR 0008: drive.file can't see inside picked folders. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

// Minimal shapes of the Google globals we use (no @types packages needed).
interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}
interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient(c: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type?: string; message?: string }) => void;
      }): { requestAccessToken(o?: { prompt?: string }): void };
    };
  };
  picker: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
declare global {
  interface Window {
    google?: GoogleGlobal;
    gapi?: { load(name: string, cb: () => void): void };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded) return resolve();
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => {
      s.dataset.loaded = "1";
      resolve();
    });
    s.addEventListener("error", () => reject(new Error(`Couldn't load ${new URL(src).host}`)));
    if (!existing) {
      s.src = src;
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

let ready: Promise<void> | undefined;

/** Loads Google Identity Services and the Picker once. */
export function loadGoogle(): Promise<void> {
  ready ??= Promise.all([
    loadScript("https://accounts.google.com/gsi/client"),
    loadScript("https://apis.google.com/js/api.js").then(() => new Promise<void>((r) => window.gapi!.load("picker", r))),
  ])
    .then(() => undefined)
    .catch((e) => {
      ready = undefined; // let a later attempt retry
      throw e;
    });
  return ready;
}

let token: { value: string; expiresAt: number } | undefined;

/**
 * An access token for Drive, asking Google (popup) only when there's none or
 * it's about to expire. Call from a click: browsers block popups otherwise.
 */
export function getDriveToken(clientId: string): Promise<string> {
  if (token && token.expiresAt - Date.now() > 60_000) return Promise.resolve(token.value);
  const google = window.google;
  if (!google) return Promise.reject(new Error("Google sign-in hasn't loaded yet."));
  return new Promise((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (r) => {
          if (!r.access_token) return reject(new Error(r.error_description ?? r.error ?? "Google sign-in failed."));
          token = { value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 };
          resolve(r.access_token);
        },
        error_callback: (e) =>
          reject(new Error(e.type === "popup_closed" ? "Google sign-in was closed." : (e.message ?? "Google sign-in failed."))),
      })
      .requestAccessToken();
  });
}

/** Opens Google Picker (files only, multi-select). Resolves with the picked files, or [] if cancelled. */
export function pickFiles(cfg: GoogleImportConfig, accessToken: string): Promise<PickedFile[]> {
  const p = window.google!.picker;
  // My Drive opens at the top of the person's own Drive; folders are there to browse into, not to pick.
  const myDrive = new p.DocsView(p.ViewId.DOCS).setParent("root").setIncludeFolders(true).setSelectFolderEnabled(false);
  myDrive.setLabel?.("My Drive");
  const shared = new p.DocsView(p.ViewId.DOCS).setOwnedByMe(false).setSelectFolderEnabled(false);
  shared.setLabel?.("Shared with me");

  return new Promise((resolve) => {
    new p.PickerBuilder()
      .addView(myDrive)
      .addView(shared)
      .enableFeature(p.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.projectNumber)
      .setOrigin(window.location.origin)
      .setTitle("Choose files to import")
      .setCallback((data: { action: string; docs?: { id: string; name: string; mimeType: string; sizeBytes?: number }[] }) => {
        if (data.action === p.Action.PICKED) {
          resolve((data.docs ?? []).map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType, sizeBytes: d.sizeBytes })));
        } else if (data.action === p.Action.CANCEL) {
          resolve([]);
        }
      })
      .build()
      .setVisible(true);
  });
}
