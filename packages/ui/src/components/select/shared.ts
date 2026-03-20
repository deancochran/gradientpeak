export const SELECT_TRIGGER_SIZES = ["default", "sm"] as const;

export type SelectTriggerSize = (typeof SELECT_TRIGGER_SIZES)[number];

export type Option = {
  label: string;
  value: string;
  disabled?: boolean;
};
