import type { createEventReadRepository } from "../../infrastructure/repositories";

type EventReadRepository = ReturnType<typeof createEventReadRepository>;
type ListOwnedEventsInput = Parameters<EventReadRepository["listOwnedEvents"]>[0];
type OwnedEventRow = NonNullable<
  Awaited<ReturnType<EventReadRepository["listOwnedEvents"]>>
>[number];

/**
 * Loads enough owned event pages to fill a visible page when excluded legacy
 * records occur between otherwise eligible rows.
 */
export async function listVisibleOwnedEvents(input: {
  repository: EventReadRepository;
  query: ListOwnedEventsInput;
  isVisible: (row: OwnedEventRow) => boolean;
  buildCursor: (row: OwnedEventRow) => NonNullable<ListOwnedEventsInput["cursor"]>;
}): Promise<{ rows: OwnedEventRow[]; hasMore: boolean }> {
  const { repository, query, isVisible, buildCursor } = input;
  const requestedCount = query.limit;
  const visibleRows: OwnedEventRow[] = [];
  let cursor = query.cursor;
  let hasMore = false;

  while (visibleRows.length < requestedCount + 1) {
    const batch = await repository.listOwnedEvents({
      ...query,
      cursor,
      limit: requestedCount + 1,
    });
    const rawRows = batch ?? [];
    if (rawRows.length === 0) break;

    visibleRows.push(...rawRows.filter(isVisible));

    const lastRawRow = rawRows[rawRows.length - 1];
    if (!lastRawRow || rawRows.length < requestedCount + 1) break;

    cursor = buildCursor(lastRawRow);

    if (visibleRows.length > requestedCount) {
      hasMore = true;
      break;
    }
  }

  return {
    rows: visibleRows.slice(0, requestedCount + 1),
    hasMore: hasMore || visibleRows.length > requestedCount,
  };
}
