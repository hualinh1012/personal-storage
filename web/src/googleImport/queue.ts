/**
 * Runs import items a few at a time. Each item ends done, skipped, failed or
 * cancelled; one failure never stops the rest. Cancelling drops the queued
 * items and aborts the in-flight ones (through the signal passed to `run`).
 */

export type ItemStatus = "queued" | "copying" | "done" | "skipped" | "failed" | "cancelled";

export interface QueueItem {
  id: string;
  status: ItemStatus;
  reason?: string;
  /** Bytes copied, once done. */
  bytes?: number;
}

export type Outcome =
  | { status: "done"; bytes?: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export interface QueueOptions<T> {
  concurrency: number;
  signal?: AbortSignal;
  /** Called with a fresh array after every change. */
  onChange?: (items: T[]) => void;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runQueue<T extends QueueItem>(
  initial: T[],
  run: (item: T, signal: AbortSignal) => Promise<Outcome>,
  { concurrency, signal = new AbortController().signal, onChange }: QueueOptions<T>,
): Promise<T[]> {
  let items = [...initial];
  const update = (i: number, patch: Partial<QueueItem>) => {
    items = items.map((it, j) => (j === i ? { ...it, ...patch } : it));
    onChange?.(items);
  };
  const cancelQueued = () => {
    if (items.some((it) => it.status === "queued")) {
      items = items.map((it) => (it.status === "queued" ? { ...it, status: "cancelled" as const } : it));
      onChange?.(items);
    }
  };
  signal.addEventListener("abort", cancelQueued, { once: true });

  let next = 0;
  const worker = async () => {
    for (;;) {
      if (signal.aborted) return;
      while (next < items.length && items[next].status !== "queued") next++;
      if (next >= items.length) return;
      const i = next++;
      update(i, { status: "copying" });
      let outcome: Outcome;
      try {
        outcome = await run(items[i], signal);
      } catch (error) {
        outcome = { status: "failed", reason: reasonOf(error) };
      }
      // Anything that didn't finish before Cancel counts as cancelled, whatever error the abort caused.
      if (signal.aborted && outcome.status !== "done") update(i, { status: "cancelled", reason: undefined });
      else update(i, { ...outcome });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  signal.removeEventListener("abort", cancelQueued);
  return items;
}
