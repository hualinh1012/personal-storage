import { signInWithRedirect } from "aws-amplify/auth";

export default function Landing() {
  return (
    <main className="center">
      <h1>Family Drive</h1>
      <button className="primary" onClick={() => signInWithRedirect({ provider: "Google" })}>
        Sign in with Google
      </button>
    </main>
  );
}
