/**
 * Custom Storage Browser action: "Import from Google Drive" in the ⋮ menu.
 * The work happens in GoogleImportView (its own queue, not Storage Browser's
 * task handler), so the handler is a no-op that Storage Browser requires.
 */
export const GOOGLE_IMPORT_ACTION = "googleImport";

export const googleImportActionConfig = {
  viewName: "GoogleImportView" as const,
  actionListItem: {
    icon: "upload-file" as const,
    label: "Import from Google Drive",
    // Doesn't depend on a selection; hidden where uploads aren't allowed.
    disable: () => false,
    hide: (permissions: string[]) => !permissions.includes("write"),
  },
  handler: () => ({ result: Promise.resolve({ status: "COMPLETE" as const }) }),
};
