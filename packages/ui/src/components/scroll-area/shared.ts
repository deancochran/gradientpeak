export const SCROLL_BAR_ORIENTATIONS = ["horizontal", "vertical"] as const;

export type ScrollBarOrientation = (typeof SCROLL_BAR_ORIENTATIONS)[number];
