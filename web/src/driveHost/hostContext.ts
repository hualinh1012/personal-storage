import { createContext, useContext } from "react";
import type { HostState } from "./feature";

/** Where the person is in the drive; DriveView provides it to every feature view. */
export const DriveHostContext = createContext<HostState | null>(null);

/** The host state, for a feature view rendered inside DriveView. */
export function useDriveHost(): HostState {
  const host = useContext(DriveHostContext);
  if (!host) throw new Error("This view must be rendered inside DriveView.");
  return host;
}
