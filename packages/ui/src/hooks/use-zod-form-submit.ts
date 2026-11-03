import { useCallback, useEffect, useRef, useState } from "react";
import {
  type FieldErrors,
  type FieldValues,
  type Path,
  set,
  type UseFormReturn,
} from "react-hook-form";
import { flushPendingFormDrafts, usePendingFormDraft } from "./pending-form-drafts";

type UseZodFormSubmitParams<
  TFieldValues extends FieldValues,
  TContext,
  TTransformedValues extends FieldValues,
> = {
  form: UseFormReturn<TFieldValues, TContext, TTransformedValues>;
  onSubmit: (values: TTransformedValues) => Promise<void> | void;
  onError?: ((error: unknown) => Promise<void> | void) | undefined;
  onValidationError?: ((errors: FieldErrors<TFieldValues>) => void) | undefined;
  shouldRethrow?: boolean;
  submittingLabel?: string;
  resetKey?: unknown;
};
type SubmitButtonStateOptions = { disabled?: boolean; label: string; submittingLabel?: string };

export function useZodFormSubmit<
  TFieldValues extends FieldValues,
  TContext = undefined,
  TTransformedValues extends FieldValues = TFieldValues,
>({
  form,
  onSubmit,
  onError,
  onValidationError,
  shouldRethrow = true,
  submittingLabel,
  resetKey,
}: UseZodFormSubmitParams<TFieldValues, TContext, TTransformedValues>) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const previousKey = useRef(resetKey);
  const previousControl = useRef(form.control);
  if (!Object.is(previousKey.current, resetKey) || previousControl.current !== form.control) {
    previousKey.current = resetKey;
    previousControl.current = form.control;
    generation.current += 1;
    pending.current = false;
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const resetSubmitState = useCallback(() => {
    generation.current += 1;
    pending.current = false;
    setIsSubmitting(false);
    setSubmitError(null);
  }, []);
  // This effect intentionally owns state reset transitions triggered by the dependency list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey and control transitions are not read in the body.
  useEffect(() => {
    setIsSubmitting(false);
    setSubmitError(null);
  }, [resetKey, form.control]);
  usePendingFormDraft(form.control, { commit: () => undefined, discard: resetSubmitState });
  const handlerGeneration = generation.current;

  const handleSubmit = useCallback(
    async (event?: Parameters<ReturnType<typeof form.handleSubmit>>[0]) => {
      if (!alive.current || pending.current || generation.current !== handlerGeneration) {
        event?.preventDefault?.();
        return;
      }
      pending.current = true;
      const attempt = generation.current;
      const current = () => alive.current && generation.current === attempt;
      setSubmitError(null);
      try {
        const issues = flushPendingFormDrafts(form.control);
        if (issues.length) {
          event?.preventDefault?.();
          const errors: FieldErrors<TFieldValues> = {};
          for (const issue of issues) {
            const error = { type: "input", message: issue.message };
            const name = issue.name as Path<TFieldValues>;
            form.setError(name, error);
            set(errors, name, error);
          }
          const first = issues[0];
          if (first?.focus) first.focus();
          else if (first) form.setFocus(first.name as Path<TFieldValues>);
          onValidationError?.(errors);
          return;
        }
        await form.handleSubmit(
          async (values) => {
            if (!current()) return;
            setIsSubmitting(true);
            try {
              await onSubmit(values);
            } catch (error) {
              if (current()) {
                setSubmitError(
                  error instanceof Error ? error : new Error("Form submission failed"),
                );
                await onError?.(error);
              }
              if (shouldRethrow) throw error;
            }
          },
          (errors) => {
            if (current()) onValidationError?.(errors);
          },
        )(event);
      } finally {
        if (current()) {
          pending.current = false;
          setIsSubmitting(false);
        }
      }
    },
    [form, onSubmit, onError, onValidationError, shouldRethrow, handlerGeneration],
  );
  const label = submittingLabel ?? "Saving...";
  const getSubmitButtonState = useCallback(
    (options: SubmitButtonStateOptions) => ({
      disabled: Boolean(options.disabled || isSubmitting),
      label: isSubmitting ? (options.submittingLabel ?? label) : options.label,
      loading: isSubmitting,
      loadingLabel: options.submittingLabel ?? label,
    }),
    [isSubmitting, label],
  );
  return {
    getSubmitButtonState,
    handleSubmit,
    isSubmitting,
    resetSubmitState,
    submitError,
    submittingLabel: label,
    submitButtonState: {
      disabled: isSubmitting,
      label,
      loading: isSubmitting,
      loadingLabel: label,
    },
  };
}
