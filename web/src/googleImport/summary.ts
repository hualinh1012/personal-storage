import type { ItemStatus, QueueItem } from "./queue";

export const STATUS_LABEL: Record<ItemStatus, string> = {
  queued: "Waiting",
  copying: "Copying…",
  done: "Copied",
  skipped: "Skipped",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}

/** "3 copied, 1 skipped, 1 failed · 12 MB": only the statuses that occur, in a fixed order. */
export function summaryLine(items: QueueItem[]): string {
  const count = (s: ItemStatus) => items.filter((i) => i.status === s).length;
  const parts = (
    [
      ["done", "copied"],
      ["copying", "copying"],
      ["queued", "waiting"],
      ["skipped", "skipped"],
      ["failed", "failed"],
      ["cancelled", "cancelled"],
    ] as const
  )
    .map(([s, word]) => [count(s), word] as const)
    .filter(([n]) => n > 0)
    .map(([n, word]) => `${n} ${word}`);
  const bytes = items.reduce((sum, i) => sum + (i.bytes ?? 0), 0);
  return `${parts.join(", ") || "Nothing to import"} · ${formatBytes(bytes)}`;
}
