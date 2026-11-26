import type { LocationKind } from "../locationPolicy";

/** What the drive calls each kind of location, with its sidebar icon (GLOSSARY.md). */
export const LOCATION_LABELS: Record<Exclude<LocationKind, "other">, { label: string; icon: string }> = {
  shared: { label: "Shared drive", icon: "folder_shared" },
  personal: { label: "My files", icon: "person" },
  deleted: { label: "Deleted", icon: "delete" },
};

/** `driveLocations()` ids to kinds. */
export const KIND_OF_ID: Record<string, Exclude<LocationKind, "other">> = { Global: "shared", Personal: "personal", Deleted: "deleted" };
