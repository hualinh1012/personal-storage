import { signInWithRedirect } from "aws-amplify/auth";
import { Icon } from "../theme/Icon";
import { AuthCard } from "./AuthCard";

export default function Landing({ onSignIn = () => signInWithRedirect({ provider: "Google" }) }: { onSignIn?: () => void }) {
  return (
    <AuthCard title="Sign in">
      <p className="auth-card__text">The family's shared files. Sign in with your Google account to continue.</p>
      <button className="primary button--with-icon auth-card__action" onClick={onSignIn}>
        <Icon name="login" />
        Sign in with Google
      </button>
    </AuthCard>
  );
}
