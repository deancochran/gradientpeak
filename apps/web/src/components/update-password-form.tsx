import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { cn } from "@repo/ui/lib/cn";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { getUpdatePasswordFormError } from "../lib/auth/form-errors";
import { type UpdatePasswordFormValues, updatePasswordFormSchema } from "../lib/auth/form-schemas";
import { resetPasswordAction } from "../lib/auth/server-actions";
import { AuthCardShell } from "./auth-card-shell";

export function UpdatePasswordForm({
  className,
  token,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { token?: string }) {
  const resetPassword = useServerFn(resetPasswordAction);
  const form = useForm<UpdatePasswordFormValues>({
    resolver: zodResolver(updatePasswordFormSchema),
    defaultValues: {
      confirmPassword: "",
      password: "",
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    form.clearErrors();

    if (!token) {
      form.setError("root", { message: "Missing or invalid reset token" });
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

      if (formError.target === "root") {
        form.setError("root", { message: formError.message });
        return;
      }

      form.setError("password", { message: formError.message });
    }
  });

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AuthCardShell
        title="Reset Your Password"
        description="Please enter your new password below."
      >
        <Form {...form}>
          <form action={resetPasswordAction.url} method="post" onSubmit={handleSubmit}>
            <input type="hidden" name="token" value={token ?? ""} />
            <div className="flex flex-col gap-6">
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
                <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
              ) : null}

              <LoadingButton
                disabled={form.formState.isSubmitting || !token}
                loading={form.formState.isSubmitting}
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
