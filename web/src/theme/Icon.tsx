/**
 * A Material Symbols icon (Apache 2.0), drawn from the "Material Symbols
 * Outlined" font loaded in index.html. `name` is the icon's ligature, e.g.
 * "folder" or "search" (https://fonts.google.com/icons). Decorative: give the
 * surrounding control its own label.
 */
export function Icon({ name, filled = false, className }: { name: string; filled?: boolean; className?: string }) {
  return (
    <span className={["icon", filled ? "icon--filled" : "", className ?? ""].filter(Boolean).join(" ")} aria-hidden="true">
      {name}
    </span>
  );
}
