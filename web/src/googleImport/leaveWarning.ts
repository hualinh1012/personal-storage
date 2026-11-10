/**
 * While an import runs, leaving or reloading the page would stop it (it runs
 * in this tab), so the browser asks first. Browsers show their own wording;
 * the handler only has to cancel the event. Returns the cleanup.
 */
export function warnOnLeave(target: Pick<EventTarget, "addEventListener" | "removeEventListener"> = window): () => void {
  const handler = (e: Event) => {
    e.preventDefault();
    // Older browsers need returnValue set to show the prompt.
    e.returnValue = false;
  };
  target.addEventListener("beforeunload", handler);
  return () => target.removeEventListener("beforeunload", handler);
}
