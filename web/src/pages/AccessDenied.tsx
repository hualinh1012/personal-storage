import { signOut } from "aws-amplify/auth";

export default function AccessDenied() {
  return (
    <main className="center">
      <h1>Family Drive</h1>
      <p>You don't have access to this drive.</p>
      <button className="link" onClick={() => signOut()}>
        Sign out
      </button>
    </main>
  );
}
