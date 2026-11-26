import { signOutSafely } from "../session";
import { AuthCard } from "./AuthCard";

export default function AccessDenied({ onSignOut = signOutSafely }: { onSignOut?: () => void }) {
  return (
    <AuthCard icon="lock" title="You don't have access to this drive.">
      <p className="auth-card__text">This Google account isn't on the family's list. Sign out and try another account, or ask whoever runs the drive to add you.</p>
      <button className="outlined auth-card__action" onClick={onSignOut}>
        Sign out
      </button>
    </AuthCard>
  );
}
