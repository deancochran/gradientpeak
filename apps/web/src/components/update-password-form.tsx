import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
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
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="new-password"
                        type="password"
                        placeholder="New password"
                      />
                    </FormControl>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>Password must contain:</p>
                      <p>At least 8 characters</p>
                      <p>One uppercase letter</p>
                      <p>One number</p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm password *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="new-password"
                        type="password"
                        placeholder="Confirm new password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.formState.errors.root ? (
                <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
              ) : null}

              <Button type="submit" disabled={form.formState.isSubmitting || !token}>
                {form.formState.isSubmitting ? "Saving..." : "Save new password"}
              </Button>
            </div>
          </form>
        </Form>
      </AuthCardShell>
    </div>
  );
}
