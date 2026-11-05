import { signOutSafely } from "../session";

export default function AccessDenied() {
  return (
    <main className="center">
      <h1>Family Drive</h1>
      <p>You don't have access to this drive.</p>
      <button className="link" onClick={signOutSafely}>
        Sign out
      </button>
    </main>
  );
}
