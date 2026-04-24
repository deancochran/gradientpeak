import { z } from "zod";

export const indexCursorSchema = z
  .string()
  .regex(/^index:\d+$/, "Cursor must be in 'index:<n>' format");

export function parseIndexCursor(cursor: string | undefined) {
  if (!cursor) {
    return 0;
  }

  return Number.parseInt(cursor.slice(6), 10);
}

export function buildIndexCursor(nextIndex: number) {
  return `index:${nextIndex}`;
}

export function buildIndexPageInfo(input: { offset: number; limit: number; total: number }) {
  const hasMore = input.offset + input.limit < input.total;

  return {
    hasMore,
    nextCursor: hasMore ? buildIndexCursor(input.offset + input.limit) : undefined,
  };
}
