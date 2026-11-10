/*
 * Pure rules for the file list pager: how many rows Storage Browser shows for
 * a folder, and which page numbers to offer. No S3 or React here.
 */

/** Storage Browser's page size (its default; we don't override it). */
export const PAGE_SIZE = 100;

/** What `list` from @aws-amplify/storage returns with `subpathStrategy: exclude` (the parts we use). */
export interface FolderListing {
  items: { path: string }[];
  excludedSubpaths?: string[];
}

// Keys Storage Browser drops because they'd break navigation (`/`, `./`, `../`) or
// aren't usable as objects (`.`, `..`). Mirrors its `filterDotItems`.
const DOT_KEYS = new Set(["/", "./", "../", ".", ".."]);

/**
 * The number of rows Storage Browser shows for `prefix` across all pages,
 * counted the way its listLocationItems handler builds them
 * (@aws-amplify/ui-react-storage 3.18.4, `parseResult`):
 * - each subfolder (common prefix) is a row;
 * - each object is a row, except the folder's own placeholder (`prefix` itself);
 * - a zero-byte key ending in `/` is shown as a folder, but it's still one row;
 * - dot keys are dropped.
 * Re-check against that handler after upgrading the package.
 */
export function countRows(listing: FolderListing, prefix: string): number {
  const keys = [...(listing.excludedSubpaths ?? []), ...listing.items.map((i) => i.path).filter((p) => p !== prefix)];
  return keys.filter((key) => {
    const rest = (key.startsWith(prefix) ? key.slice(prefix.length) : key).trim();
    return !DOT_KEYS.has(rest);
  }).length;
}

/** Pages needed for `rows` rows; an empty folder still has page 1. */
export function pageCount(rows: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(rows / pageSize));
}

/** A page number to show as a button, or a gap between them. */
export type PageLink = number | "gap";

/**
 * Page numbers for the pager: all of them when there are few, otherwise the
 * first, the last and the ones around the current page, with gaps between.
 * The list never changes length while you move through pages, so the buttons
 * don't jump around: 1 … 4 5 6 … 20.
 */
export function pageLinks(current: number, total: number): PageLink[] {
  const MAX = 7;
  if (total <= MAX) return Array.from({ length: total }, (_, i) => i + 1);
  // Near either end, show a block of five pages next to that end.
  if (current <= 4) return [1, 2, 3, 4, 5, "gap", total];
  if (current >= total - 3) return [1, "gap", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "gap", current - 1, current, current + 1, "gap", total];
}

/** Where a jump to a later page stands, given what the browser has loaded so far. */
export interface JumpState {
  target: number;
  page: number;
  /** Rows Storage Browser holds for this folder (it keeps every page it fetched). */
  loadedRows: number;
  /** Whether S3 has more rows after the loaded ones. */
  hasMore: boolean;
  /** Whether a list request is in flight. */
  fetching: boolean;
  pageSize?: number;
}

/**
 * The next step of a jump to `target`. Storage Browser only fetches one page
 * per paginate call, so a jump keeps asking for the target page until enough
 * rows are loaded to show it:
 * - "wait": a request is in flight;
 * - "paginate": call onPaginate(target) (fetches one more page if there is one);
 * - "done": the target page is showing.
 */
export function jumpStep(s: JumpState): "wait" | "paginate" | "done" {
  if (s.fetching) return "wait";
  const pageSize = s.pageSize ?? PAGE_SIZE;
  const loaded = s.loadedRows > (s.target - 1) * pageSize || !s.hasMore;
  if (s.page === s.target && loaded) return "done";
  return "paginate";
}
