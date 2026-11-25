import type { DriveFeature } from "./feature";

/**
 * Upload in the top bar (owner's choice; it's also in Storage Browser's ⋮
 * menu). It opens Storage Browser's own upload view for the open folder.
 */
export const uploadFeature: DriveFeature = {
  name: "upload",
  topBar: [{ label: "Upload", actionType: "upload", primary: true }],
};
