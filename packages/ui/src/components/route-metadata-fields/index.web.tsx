"use client";

import type { FieldPath, FieldValues } from "react-hook-form";
import { FormTextareaField, FormTextField } from "../form/index.web";
import type { RouteMetadataFieldsProps } from "./shared";

function RouteMetadataFields<TFieldValues extends FieldValues>({
  control,
  descriptionClassName = "min-h-28",
  descriptionHint = "Optional notes about terrain, access, or intended use.",
  descriptionLabel = "Description",
  descriptionPlaceholder,
  descriptionTestId,
  disabled = false,
  nameLabel = "Route name",
  namePlaceholder,
  nameTestId,
  selectNameTextOnFocus,
}: RouteMetadataFieldsProps<TFieldValues>) {
  return (
    <>
      <FormTextField
        control={control}
        disabled={disabled}
        label={nameLabel}
        name={"name" as FieldPath<TFieldValues>}
        {...(namePlaceholder !== undefined ? { placeholder: namePlaceholder } : {})}
        required
        {...(selectNameTextOnFocus !== undefined
          ? { selectTextOnFocus: selectNameTextOnFocus }
          : {})}
        {...(nameTestId !== undefined ? { testId: nameTestId } : {})}
      />
      <FormTextareaField
        className={descriptionClassName}
        control={control}
        description={descriptionHint}
        disabled={disabled}
        label={descriptionLabel}
        name={"description" as FieldPath<TFieldValues>}
        {...(descriptionPlaceholder !== undefined ? { placeholder: descriptionPlaceholder } : {})}
        {...(descriptionTestId !== undefined ? { testId: descriptionTestId } : {})}
      />
    </>
  );
}

export type { RouteMetadataFieldsProps } from "./shared";
export { RouteMetadataFields };
