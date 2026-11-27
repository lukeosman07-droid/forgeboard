// A tiny in-page signal: the project's realtime listener announces which tasks
// changed, and an open task panel reloads its comments, subtasks and history.

const EVENT = "forgeboard:items-changed";

export function announceItemsChanged(itemIds: string[]) {
  if (typeof window === "undefined" || itemIds.length === 0) return;
  window.dispatchEvent(new CustomEvent<string[]>(EVENT, { detail: itemIds }));
}

/** Calls back with the changed task IDs. Returns the unsubscribe function. */
export function onItemsChanged(callback: (itemIds: string[]) => void) {
  const listener = (e: Event) => callback((e as CustomEvent<string[]>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
