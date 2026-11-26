import type { ReactNode } from "react";
import { Icon } from "../theme/Icon";

/**
 * The pages outside the drive (sign-in, access denied, loading, errors) in the
 * drive's style (issue #13): the app's icon and name over one card.
 */
export function AuthCard({ icon, title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <img className="auth-card__logo" src="/icons/icon-192.png" alt="" width={64} height={64} />
        <p className="auth-card__brand">Family Drive</p>
        {icon && <Icon name={icon} className="auth-card__icon" />}
        <h1 className="auth-card__title">{title}</h1>
        {children}
      </div>
    </main>
  );
}
