import { z } from "zod";

type FeedCursorItem = {
  id: string;
  started_at: string;
};

export function decodeFeedCursor(cursor: string | null | undefined) {
  if (!cursor) {
    return null;
  }

  const [startedAt, id] = cursor.split("|");
  const startedAtDate = startedAt ? new Date(startedAt) : null;

  if (!startedAtDate || Number.isNaN(startedAtDate.getTime())) {
    return null;
  }

  return {
    id: id && z.string().uuid().safeParse(id).success ? id : null,
    startedAt: startedAtDate,
  };
}

function encodeFeedCursor(activity: FeedCursorItem) {
  return `${activity.started_at}|${activity.id}`;
}

/** Maps the over-fetched feed rows and produces a stable composite continuation cursor. */
export function buildFeedPage<TRow, TItem extends FeedCursorItem>(input: {
  rows: TRow[];
  limit: number;
  mapRow: (row: TRow) => TItem;
}) {
  let items = input.rows.map(input.mapRow);
  let nextCursor: string | null = null;

  if (items.length > input.limit) {
    const nextItem = items[input.limit - 1];
    if (nextItem) {
      nextCursor = encodeFeedCursor(nextItem);
    }
    items = items.slice(0, input.limit);
  }

  return {
    items,
    nextCursor,
    hasMore: nextCursor !== null,
  };
}
