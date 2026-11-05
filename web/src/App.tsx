import { useEffect, useState } from "react";
import { Amplify } from "aws-amplify";
import { getCurrentUser } from "aws-amplify/auth";
import { loadConfig, toAmplifyOutputs } from "./config";
import { currentUserEmail } from "./session";
import { isAccessDeniedRedirect } from "./authErrors";
import Landing from "./pages/Landing";
import AccessDenied from "./pages/AccessDenied";
import Drive from "./pages/Drive";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "denied" }
  | { kind: "landing" }
  | { kind: "drive"; email: string };

export default function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    const set = (s: State) => !cancelled && setState(s);

    (async () => {
      try {
        const cfg = await loadConfig();
        Amplify.configure(toAmplifyOutputs(cfg, window.location.origin));
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
        set({ kind: "drive", email: await currentUserEmail() });
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
      return <main className="center">Loading…</main>;
    case "error":
      return <main className="center">Something went wrong: {state.message}</main>;
    case "denied":
      return <AccessDenied />;
    case "landing":
      return <Landing />;
    case "drive":
      return <Drive email={state.email} />;
  }
}
