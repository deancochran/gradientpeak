import {
  type RouteEditFormInput,
  type RouteEditForm as RouteEditFormValues,
  routeEditFormSchema,
} from "@repo/core/route-files";
import { Button } from "@repo/ui/components/button";
import { Form, FormTextareaField, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";

import { useUnsavedChangesGuard } from "../../lib/use-unsaved-changes-guard";

type RouteEditFormProps = {
  defaultValues: RouteEditFormInput;
  onCancel: () => void;
  onSubmit: (values: RouteEditFormValues) => Promise<void> | void;
  pending?: boolean;
};

export function RouteEditForm({
  defaultValues,
  onCancel,
  onSubmit,
  pending = false,
}: RouteEditFormProps) {
  const form = useZodForm<RouteEditFormInput, undefined, RouteEditFormValues>({
    defaultValues,
    schema: routeEditFormSchema,
  });
  const submit = useZodFormSubmit({
    form,
    onSubmit,
    shouldRethrow: false,
    submittingLabel: "Saving route...",
  });
  const isPending = pending || submit.isSubmitting;
  const submitError = form.formState.errors.root?.message ?? submit.submitError?.message;
  const { guardedCancel } = useUnsavedChangesGuard({
    draft: form.getValues(),
    dirty: form.formState.isDirty,
    pending: isPending,
  });

  return (
    <Form {...form}>
      <form className="space-y-4" data-testid="route-edit-form" onSubmit={submit.handleSubmit}>
        <FormTextField
          control={form.control}
          disabled={isPending}
          label="Route name"
          name="name"
          required
          testId="route-edit-name-input"
        />
        <FormTextareaField
          className="min-h-28"
          control={form.control}
          description="Optional notes about terrain, access, or intended use."
          disabled={isPending}
          label="Description"
          name="description"
          testId="route-edit-description-input"
        />
        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            data-testid="route-edit-cancel"
            disabled={isPending}
            onClick={() => guardedCancel(onCancel)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <LoadingButton
            data-testid="route-edit-save"
            disabled={isPending}
            loading={isPending}
            loadingLabel="Saving route..."
            type="submit"
          >
            Save route
          </LoadingButton>
        </div>
      </form>
    </Form>
  );
}
