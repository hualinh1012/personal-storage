import { useContext, useEffect } from "react";
import { Icon } from "../theme/Icon";
import type { DriveFeature } from "./feature";
import { DriveHostContext } from "./hostContext";

/** Storage Browser's AddFiles / AddFolder props (@aws-amplify/ui-react-storage 3.18.4). */
interface AddProps {
  isDisabled?: boolean;
  label?: string;
}

/**
 * Storage Browser's own New folder and Upload in the "+ New" menu (issue #13;
 * Upload is also in its ⋮ menu). File upload and Folder upload open its upload
 * view and then its file or folder picker straight away: the view's Add files /
 * Add folder buttons below press themselves once when the host says the person
 * picked that item. The click that chose the item still counts as the user's
 * gesture, so the browser lets the picker open.
 */
export const uploadFeature: DriveFeature = {
  name: "upload",
  newMenu: [
    { label: "New folder", icon: "create_new_folder", actionType: "createFolder" },
    { label: "File upload", icon: "upload_file", actionType: "upload", pick: "files" },
    { label: "Folder upload", icon: "drive_folder_upload", actionType: "upload", pick: "folder" },
  ],
  components: {
    AddFiles: ({ onAddFiles, ...props }: AddProps & { onAddFiles?: () => void }) => (
      <AddButton kind="files" icon="upload_file" onAdd={onAddFiles} {...props} />
    ),
    AddFolder: ({ onAddFolder, ...props }: AddProps & { onAddFolder?: () => void }) => (
      <AddButton kind="folder" icon="drive_folder_upload" onAdd={onAddFolder} {...props} />
    ),
  },
};

function AddButton({ kind, icon, label, isDisabled, onAdd }: AddProps & { kind: "files" | "folder"; icon: string; onAdd?: () => void }) {
  const host = useContext(DriveHostContext);
  useEffect(() => {
    if (host?.takePick(kind)) onAdd?.();
    // Once, when the upload view opens.
  }, []);
  return (
    <button type="button" className="outlined button--with-icon" disabled={isDisabled} onClick={onAdd}>
      <Icon name={icon} />
      {label}
    </button>
  );
}
