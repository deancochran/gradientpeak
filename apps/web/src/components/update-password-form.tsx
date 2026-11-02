import { Form, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { cn } from "@repo/ui/lib/cn";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getUpdatePasswordFormError } from "../lib/auth/form-errors";
import { type UpdatePasswordFormValues, updatePasswordFormSchema } from "../lib/auth/form-schemas";
import { resetPasswordAction } from "../lib/auth/server-actions";
import { contractEpochFormInputProps } from "../lib/contract-epoch";
import { AuthCardShell } from "./auth-card-shell";

export function UpdatePasswordForm({
  className,
  token,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { token?: string }) {
  const resetPassword = useServerFn(resetPasswordAction);
  const [rejectedToken, setRejectedToken] = useState<string | null>(null);
  const invalidToken = !token || rejectedToken === token;
  const form = useZodForm<UpdatePasswordFormValues>({
    schema: updatePasswordFormSchema,
    defaultValues: {
      confirmPassword: "",
      password: "",
    },
  });

  const submit = useZodFormSubmit<UpdatePasswordFormValues>({
    form,
    shouldRethrow: false,
    submittingLabel: "Saving...",
    onSubmit: async (values) => {
      form.clearErrors();

      if (invalidToken) {
        form.setError("root", {
          message: "This reset link is missing or invalid. Request a new link and try again.",
        });
        return;
      }

      try {
        await resetPassword({
          data: {
            ...values,
            token,
          },
        });
      } catch (error: unknown) {
        const formError = getUpdatePasswordFormError(error);
        if (/invalid.*token|token.*(?:invalid|expired)|expired.*token/i.test(formError.message)) {
          setRejectedToken(token ?? null);
        }

        if (formError.target === "root") {
          form.setError("root", { message: formError.message });
          return;
        }

        form.setError("password", { message: formError.message });
      }
    },
  });

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AuthCardShell
        title="Reset Your Password"
        description="Please enter your new password below."
      >
        <Form {...form}>
          <form action={resetPasswordAction.url} method="post" onSubmit={submit.handleSubmit}>
            <input {...contractEpochFormInputProps} />
            <input type="hidden" name="token" value={token ?? ""} />
            <div className="flex flex-col gap-6">
              {invalidToken ? (
                <p className="text-destructive text-sm" role="alert">
                  This reset link is missing or invalid. Request a new link to continue.{" "}
                  <a className="underline" href="/auth/forgot-password">
                    Request a new reset link
                  </a>
                </p>
              ) : null}
              <FormTextField
                autoComplete="new-password"
                control={form.control}
                description="Password must contain: At least 8 characters. One uppercase letter. One number."
                label="New password"
                name="password"
                placeholder="New password"
                required
                type="password"
              />

              <FormTextField
                autoComplete="new-password"
                control={form.control}
                label="Confirm password"
                name="confirmPassword"
                placeholder="Confirm new password"
                required
                type="password"
              />

              {form.formState.errors.root ? (
                <p className="text-destructive text-sm" role="alert">
                  {form.formState.errors.root.message}
                </p>
              ) : null}

              <LoadingButton
                disabled={submit.isSubmitting || invalidToken}
                loading={submit.isSubmitting}
                loadingLabel="Saving..."
                type="submit"
              >
                Save new password
              </LoadingButton>
            </div>
          </form>
        </Form>
      </AuthCardShell>
    </div>
  );
}
