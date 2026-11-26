/**
 * Storage Browser names its icons (`StorageBrowserIconType`); the drive draws
 * them as Material Symbols (issue #13). File types are Storage Browser's own
 * call (from the name and content type), so a folder, photo, PDF or sheet gets
 * the same icon here as it would there, drawn the Drive way with a colour per
 * kind.
 */
export interface DriveIcon {
  /** Material Symbols name. */
  name: string;
  /** Drawn filled (folders and file types), like Drive's list. */
  filled?: boolean;
  /** The kind, for its colour: `file-icon--<kind>` in styles.css. */
  kind?: "folder" | "image" | "video" | "audio" | "pdf" | "document" | "sheet" | "slides" | "text" | "archive" | "file";
}

const ICONS: Record<string, DriveIcon> = {
  folder: { name: "folder", filled: true, kind: "folder" },
  file: { name: "draft", filled: true, kind: "file" },
  "file-image": { name: "image", filled: true, kind: "image" },
  "file-video": { name: "movie", filled: true, kind: "video" },
  "file-audio": { name: "music_note", filled: true, kind: "audio" },
  "file-pdf": { name: "picture_as_pdf", filled: true, kind: "pdf" },
  "file-word": { name: "description", filled: true, kind: "document" },
  "file-excel": { name: "table_chart", filled: true, kind: "sheet" },
  "file-powerpoint": { name: "slideshow", filled: true, kind: "slides" },
  "file-text": { name: "article", filled: true, kind: "text" },
  "file-archive": { name: "folder_zip", filled: true, kind: "archive" },
  "action-queued": { name: "schedule" },
  "action-progress": { name: "progress_activity" },
  "action-canceled": { name: "do_not_disturb_on" },
  "action-success": { name: "check_circle" },
  "action-error": { name: "error" },
  "action-initial": { name: "radio_button_unchecked" },
  "action-info": { name: "info" },
  cancel: { name: "cancel" },
  "create-folder": { name: "create_new_folder" },
  "copy-file": { name: "file_copy" },
  "delete-file": { name: "delete" },
  dismiss: { name: "close" },
  download: { name: "download" },
  error: { name: "error" },
  exit: { name: "arrow_back" },
  info: { name: "info" },
  loading: { name: "progress_activity" },
  menu: { name: "more_vert" },
  "vertical-kebab": { name: "more_vert" },
  "paginate-next": { name: "chevron_right" },
  "paginate-previous": { name: "chevron_left" },
  refresh: { name: "refresh" },
  search: { name: "search" },
  success: { name: "check_circle" },
  "upload-file": { name: "upload_file" },
  "upload-folder": { name: "drive_folder_upload" },
  warning: { name: "warning" },
};

/** The Material Symbols icon for one of Storage Browser's icon names; unknown names get a plain file. */
export function driveIcon(variant: string | undefined): DriveIcon | undefined {
  if (!variant) return undefined;
  return ICONS[variant] ?? (variant.startsWith("file") ? ICONS.file : { name: "help" });
}
