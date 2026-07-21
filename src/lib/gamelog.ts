// Pure logic for the dugout's shared-editing trail (game_edits). The db
// writer lives in the game actions; this stays importable by tests.

/** Rapid same-coach bursts fold into one feed row inside this window. */
export const COALESCE_WINDOW_MS = 120_000;

export interface EditStamp {
  actor: string;
  coalesceKey: string | null;
  atMs: number;
}

/**
 * A burst coalesces only when the LATEST edit in the trail is the same
 * coach doing the same kind of thing moments ago — anyone else's edit in
 * between breaks the run, so the feed stays chronologically honest and a
 * second coach's change never hides inside the first coach's row.
 */
export function shouldCoalesce(
  latest: EditStamp | null,
  next: { actor: string; coalesceKey: string | null },
  nowMs: number,
): boolean {
  return (
    latest !== null &&
    next.coalesceKey !== null &&
    latest.coalesceKey === next.coalesceKey &&
    latest.actor === next.actor &&
    nowMs - latest.atMs < COALESCE_WINDOW_MS
  );
}
