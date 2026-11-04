import { signOut } from "aws-amplify/auth";

export default function Drive({ email }: { email: string }) {
  return (
    <div className="drive">
      <header className="topbar">
        <strong>Family Drive</strong>
        <span className="spacer" />
        <span>{email}</span>
        <button className="link" onClick={() => signOut()}>
          Sign out
        </button>
      </header>
      <main className="center">{/* Task 6 replaces this body with StorageBrowser */}</main>
    </div>
  );
}
