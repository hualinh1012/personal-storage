import { useEffect, useRef, useState } from "react";
import { Icon } from "../theme/Icon";

/** The account button in the top bar: the person's initial; its menu shows the email and Sign out. */
export function AccountMenu({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const initial = email.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="account" ref={root}>
      <button
        type="button"
        className="account__avatar"
        aria-label={`Account: ${email}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {initial}
      </button>
      {open && (
        <div className="menu account__menu" role="menu" aria-label="Account">
          <div className="account__identity">
            <span className="account__avatar account__avatar--large" aria-hidden="true">
              {initial}
            </span>
            <span className="account__email">{email}</span>
          </div>
          <button type="button" role="menuitem" className="menu__item" onClick={onSignOut}>
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
