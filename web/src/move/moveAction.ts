import { defaultActionConfigs } from "@aws-amplify/ui-react-storage/browser";
import { hideUnless } from "../locationPolicy";
import type { DriveStorage } from "../storage/driveStorage";
import { moveFile, type MoveItem } from "./moveFile";

type HandlerInput = { data: MoveItem & { id: string } };

/**
 * Custom Storage Browser action: "Move" in the ⋮ menu, enabled for the same
 * selections as Copy. Hidden in read-only locations, since a move writes the
 * copy and deletes the original. S3 calls go through the drive-storage seam
 * (the signed-in person's credentials), not Storage Browser's own handlers.
 */
export function makeMoveActionConfig(storage: DriveStorage) {
  return {
    viewName: "MoveView" as const,
    actionListItem: {
      icon: "folder" as const,
      label: "Move",
      disable: defaultActionConfigs.copy.actionListItem.disable,
      hide: hideUnless("move"),
    },
    handler: ({ data }: HandlerInput) => ({
      result: moveFile(data, storage).then((r) =>
        r.status === "COMPLETE"
          ? { status: "COMPLETE" as const, value: { key: data.key } }
          : { status: "FAILED" as const, message: r.message },
      ),
    }),
  };
}
