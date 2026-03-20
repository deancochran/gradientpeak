export const DROPDOWN_MENU_ITEM_VARIANTS = ["default", "destructive"] as const;

export type DropdownMenuItemVariant =
  (typeof DROPDOWN_MENU_ITEM_VARIANTS)[number];
