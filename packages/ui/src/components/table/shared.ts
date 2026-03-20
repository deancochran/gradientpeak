export const TABLE_SLOTS = [
  "table",
  "table-header",
  "table-body",
  "table-footer",
  "table-row",
  "table-head",
  "table-cell",
  "table-caption",
] as const;

export type TableSlot = (typeof TABLE_SLOTS)[number];
