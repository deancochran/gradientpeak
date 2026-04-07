"use client";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Form, FormTextField } from "@repo/ui/components/form";
import { useZodForm } from "@repo/ui/hooks";
import { cn } from "@repo/ui/lib/cn";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { getUpdatePasswordFormError } from "@/lib/auth/form-errors";
import { type UpdatePasswordFormValues, updatePasswordFormSchema } from "@/lib/auth/form-schemas";

export function UpdatePasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const form = useZodForm({
    schema: updatePasswordFormSchema,
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const handleForgotPassword = async (values: UpdatePasswordFormValues) => {
    form.clearErrors("root");

    if (!token) {
      form.setError("root", { message: "Missing or invalid reset token" });
      return;
    }

    try {
      const result = await authClient.resetPassword({
        newPassword: values.password,
        token,
      });
      if (result.error) {
        throw result.error;
      }
      router.push("/");
    } catch (error: unknown) {
      const formError = getUpdatePasswordFormError(error);
      form.setError(formError.target, { message: formError.message });
    }
  };

  const isPending = form.formState.isSubmitting;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Reset Your Password</CardTitle>
          <CardDescription>Please enter your new password below.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleForgotPassword)}>
              <div className="flex flex-col gap-6">
                <FormTextField
                  autoComplete="new-password"
                  control={form.control}
                  label="New password"
                  name="password"
                  placeholder="New password"
                  required
                  testId="update-password-input"
                  type="password"
                />
                <div className="-mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>Password must contain:</p>
                  <p>• At least 8 characters</p>
                  <p>• One uppercase letter</p>
                  <p>• One number</p>
                </div>
                <FormTextField
                  autoComplete="new-password"
                  control={form.control}
                  label="Confirm password"
                  name="confirmPassword"
                  placeholder="Confirm new password"
                  required
                  testId="confirm-password-input"
                  type="password"
                />
                {form.formState.errors.root?.message ? (
                  <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
                ) : null}
                <Button type="submit" disabled={isPending || !token}>
                  {isPending ? "Saving..." : "Save new password"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
