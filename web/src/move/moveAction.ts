import { getProperties } from "@aws-amplify/storage/internals";
import { defaultActionConfigs, defaultHandlers } from "@aws-amplify/ui-react-storage/browser";
import { moveFile, type MoveItem, type MoveOps } from "./moveFile";

/** What Storage Browser passes to an action handler (the parts we use). */
interface ActionConfig {
  bucket: string;
  region: string;
  accountId?: string;
  customEndpoint?: string;
  credentials: unknown;
}

type HandlerInput = { config: ActionConfig; data: MoveItem & { id: string } };
type HandlerResult = { status: "COMPLETE" | "FAILED"; message?: string };

const isNotFound = (error: unknown) =>
  error instanceof Error && (error.name === "NotFound" || /not\s*found|404/i.test(error.message));

async function unwrap(op: { result: Promise<HandlerResult> }) {
  const outcome = await op.result;
  if (outcome.status !== "COMPLETE") throw new Error(outcome.message ?? "failed");
}

/** S3 operations for moveFile, using the signed-in user's location credentials. */
function storageOps({ config, data }: HandlerInput): MoveOps {
  // Storage Browser's own handlers expect its config/data shapes; we pass them through.
  const handlers = defaultHandlers as unknown as Record<"copy" | "delete", (input: unknown) => { result: Promise<HandlerResult> }>;
  return {
    async exists(key) {
      try {
        await getProperties({
          path: key,
          options: {
            bucket: { bucketName: config.bucket, region: config.region },
            locationCredentialsProvider: config.credentials as never,
            expectedBucketOwner: config.accountId,
            customEndpoint: config.customEndpoint,
          },
        });
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },
    copy: (item) => unwrap(handlers.copy({ config, data: { ...data, ...item } })),
    remove: (key) => unwrap(handlers.delete({ config, data: { ...data, key } })),
  };
}

/**
 * Custom Storage Browser action: "Move" in the ⋮ menu, enabled for the same
 * selections as Copy. Hidden in read-only locations, since a move writes the
 * copy and deletes the original.
 */
export const moveActionConfig = {
  viewName: "MoveView" as const,
  actionListItem: {
    icon: "folder" as const,
    label: "Move",
    disable: defaultActionConfigs.copy.actionListItem.disable,
    hide: (permissions: string[]) => !permissions.includes("write") || !permissions.includes("delete"),
  },
  handler: (input: HandlerInput) => ({
    result: moveFile(input.data, storageOps(input)).then((r) =>
      r.status === "COMPLETE"
        ? { status: "COMPLETE" as const, value: { key: input.data.key } }
        : { status: "FAILED" as const, message: r.message },
    ),
  }),
};
