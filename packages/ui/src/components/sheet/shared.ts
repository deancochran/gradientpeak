export const SHEET_SIDES = ["top", "right", "bottom", "left"] as const;

export type SheetSide = (typeof SHEET_SIDES)[number];
