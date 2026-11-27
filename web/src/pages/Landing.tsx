import { signInWithRedirect } from "aws-amplify/auth";
import { Icon } from "../theme/Icon";
import { AuthCard } from "./AuthCard";

/** The app's source code. The repository is public (issue #70). */
export const SOURCE_URL = "https://github.com/hualinh1012/personal-storage";

/**
 * The page people see before signing in (issue #70): what the app is, that only
 * invited people get in, where the code lives, and the sign-in button. Static
 * text only; no contact details (the page is public) and no request-access form.
 */
export default function Landing({ onSignIn = () => signInWithRedirect({ provider: "Google" }) }: { onSignIn?: () => void }) {
  return (
    <AuthCard title="A private drive for one family">
      <p className="auth-card__text">
        Family Drive is where one family keeps and shares its files and photos. It works like an online drive: upload, preview,
        move and download from any browser. Everything is stored privately in the family's own Amazon Web Services account.
      </p>
      <p className="auth-card__note">
        <Icon name="lock" className="auth-card__note-icon" />
        <span>
          Only invited people can sign in. To get access, ask the person who runs it to add your Google account.
        </span>
      </p>
      <button className="primary button--with-icon auth-card__action" onClick={onSignIn}>
        <Icon name="login" />
        Sign in with Google
      </button>
      <a className="auth-card__link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
        Source code on GitHub
        <Icon name="open_in_new" className="auth-card__link-icon" />
      </a>
    </AuthCard>
  );
}
