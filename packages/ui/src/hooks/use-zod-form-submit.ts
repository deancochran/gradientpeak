import { useCallback, useState } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

export function useZodFormSubmit<TFieldValues extends FieldValues>(params: {
  form: UseFormReturn<any>;
  onSubmit: (values: TFieldValues) => Promise<void> | void;
}) {
  const { form, onSubmit } = params;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Error | null>(null);

  const handleSubmit = useMemoizedHandle(form, onSubmit, setIsSubmitting, setSubmitError);

  const resetSubmitState = useCallback(() => {
    setIsSubmitting(false);
    setSubmitError(null);
  }, []);

  return {
    handleSubmit,
    isSubmitting,
    resetSubmitState,
    submitError,
  };
}

function useMemoizedHandle<TFieldValues extends FieldValues>(
  form: UseFormReturn<any>,
  onSubmit: (values: TFieldValues) => Promise<void> | void,
  setIsSubmitting: (value: boolean) => void,
  setSubmitError: (value: Error | null) => void,
) {
  return useCallback(
    form.handleSubmit(async (values) => {
      setSubmitError(null);
      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } catch (error) {
        setSubmitError(error instanceof Error ? error : new Error("Form submission failed"));
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    }),
    [form, onSubmit, setIsSubmitting, setSubmitError],
  );
}
