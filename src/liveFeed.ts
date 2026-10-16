// The feed checks for changes every so often. Updates already on screen take their fetched
// versions, and deleted ones drop out; new ones wait behind a button, so the page doesn't move
// under the reader.
export function applyFetched<T extends { id: string }>(
  shownIds: ReadonlySet<string>,
  fetched: T[],
): { visible: T[]; waiting: number } {
  const visible = fetched.filter((u) => shownIds.has(u.id));
  return { visible, waiting: fetched.length - visible.length };
}

export function newUpdatesLabel(n: number): string {
  return n === 1 ? "1 new update" : `${n} new updates`;
}
