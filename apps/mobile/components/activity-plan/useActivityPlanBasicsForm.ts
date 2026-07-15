import { useZodForm } from "@repo/ui/hooks";
import { useEffect, useMemo } from "react";
import { z } from "zod";

import type { ActivityPlanBasicsFormData } from "./ActivityPlanBasicsSection";

const activityPlanBasicsSchema = z.object({
  name: z.string().trim().min(1, "Plan name is required."),
  description: z.string(),
});

type UseActivityPlanBasicsFormParams = ActivityPlanBasicsFormData & {
  nameError?: string;
  onDescriptionChange: (description: string) => void;
  onNameChange: (name: string) => void;
};

export function useActivityPlanBasicsForm({
  description,
  name,
  nameError,
  onDescriptionChange,
  onNameChange,
}: UseActivityPlanBasicsFormParams) {
  const values = useMemo(() => ({ name, description }), [description, name]);
  const form = useZodForm<ActivityPlanBasicsFormData>({
    schema: activityPlanBasicsSchema,
    values,
    mode: "onChange",
  });
  const {
    clearErrors,
    setError,
    watch,
    formState: { errors },
  } = form;
  const currentNameError = errors.name?.message;

  useEffect(() => {
    const subscription = watch((nextValues, { name: changedField, type }) => {
      if (type !== "change") {
        return;
      }
      if (changedField === "name" && typeof nextValues.name === "string") {
        onNameChange(nextValues.name);
      }
      if (changedField === "description" && typeof nextValues.description === "string") {
        onDescriptionChange(nextValues.description);
      }
    });

    return subscription.unsubscribe;
  }, [onDescriptionChange, onNameChange, watch]);

  useEffect(() => {
    if (nameError && nameError !== currentNameError) {
      setError("name", { message: nameError });
      return;
    }
    if (!nameError && currentNameError) {
      clearErrors("name");
    }
  }, [clearErrors, currentNameError, nameError, setError]);

  return form;
}
