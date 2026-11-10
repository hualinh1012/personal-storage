import { useRef } from "react";

/**
 * The data of a Storage Browser view's tasks, as an array that keeps its
 * identity while the selected items stay the same. Views that run a custom
 * action over another view's selection (Move over Copy's, Restore and Delete
 * permanently over Delete's) pass this to `useAction`: the tasks array is new on
 * every render, and `useAction` resets its own tasks whenever `items` changes,
 * which re-renders, which makes new tasks again: "Maximum update depth exceeded".
 */
export function useStableItems<T extends { data: unknown }>(tasks: readonly T[]): unknown[] {
  const ref = useRef<{ key: string; items: unknown[] }>({ key: "", items: [] });
  const items = tasks.map((t) => t.data);
  // Both: Copy's tasks keep their id but change key when the destination changes.
  const key = items.map((d) => `${(d as { id?: string }).id ?? ""}|${(d as { key?: string }).key ?? ""}`).join("\n");
  if (key !== ref.current.key) ref.current = { key, items };
  return ref.current.items;
}
