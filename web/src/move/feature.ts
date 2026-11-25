import type { DriveFeature } from "../driveHost/feature";
import type { DriveStorage } from "../storage/driveStorage";
import { makeMoveActionConfig } from "./moveAction";
import { makeMoveView } from "./MoveView";

/** Move (⋮ menu, where the person can `move`): copy, then delete the original, over the drive storage. */
export function moveFeature(storage: DriveStorage): DriveFeature {
  return {
    name: "move",
    customActions: { move: makeMoveActionConfig(storage) },
    views: (parts) => ({ MoveView: makeMoveView(parts) }),
    // Move reuses Copy's parts, so Copy's "Copy to" label would be wrong there.
    displayText: { CopyView: { actionDestinationLabel: "Destination" } },
  };
}
