import { useEffect, useState } from "react";
import { Amplify } from "aws-amplify";
import { getCurrentUser } from "aws-amplify/auth";
import { googleImportConfig, loadConfig, toAmplifyOutputs, type GoogleImportConfig } from "./config";
import { currentUser } from "./session";
import type { Access } from "./access";
import { isAccessDeniedRedirect } from "./authErrors";
import Landing from "./pages/Landing";
import AccessDenied from "./pages/AccessDenied";
import { AuthCard } from "./pages/AuthCard";
import Drive from "./pages/Drive";
import { parseRetentionDays } from "./trash/retention";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "denied" }
  | { kind: "landing" }
  | {
      kind: "drive";
      email: string;
      access: Access;
      google: GoogleImportConfig | null;
      deletedRetentionDays: number | null;
    };

export default function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const set = (s: State) => !cancelled && setState(s);

    (async () => {
      let google: GoogleImportConfig | null;
      let deletedRetentionDays: number | null;
      try {
        const cfg = await loadConfig();
        Amplify.configure(toAmplifyOutputs(cfg, window.location.origin));
        google = googleImportConfig(cfg);
        deletedRetentionDays = parseRetentionDays(cfg.deletedRetentionDays);
      } catch (e) {
        return set({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }

      if (isAccessDeniedRedirect(window.location.search)) return set({ kind: "denied" });

      try {
        await getCurrentUser();
      } catch {
        return set({ kind: "landing" });
      }
      try {
        set({ kind: "drive", ...(await currentUser()), google, deletedRetentionDays });
      } catch (e) {
        set({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  switch (state.kind) {
    case "loading":
      return (
        <main className="auth-page" aria-busy="true">
          <span className="spinner" role="status" aria-label="Loading" />
        </main>
      );
    case "error":
      return (
        <AuthCard icon="error" title="Something went wrong">
          <p className="auth-card__text">{state.message}</p>
          <button className="outlined auth-card__action" onClick={() => window.location.reload()}>
            Try again
          </button>
        </AuthCard>
      );
    case "denied":
      return <AccessDenied />;
    case "landing":
      return <Landing />;
    case "drive":
      return (
        <Drive
          email={state.email}
          access={state.access}
          google={state.google}
          deletedRetentionDays={state.deletedRetentionDays}
        />
      );
  }
}
