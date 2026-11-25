import type { Control, FieldValues } from "react-hook-form";

export type RouteMetadataFieldsProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  descriptionClassName?: string;
  descriptionHint?: string;
  descriptionLabel?: string;
  descriptionPlaceholder?: string;
  descriptionTestId?: string;
  disabled?: boolean;
  nameLabel?: string;
  namePlaceholder?: string;
  nameTestId?: string;
  selectNameTextOnFocus?: boolean;
};
