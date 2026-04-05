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
import Link from "next/link";
import { useState } from "react";
import { authClient, toAbsoluteWebUrl } from "@/lib/auth/client";
import { getForgotPasswordFormError } from "@/lib/auth/form-errors";
import { type ForgotPasswordFormValues, forgotPasswordFormSchema } from "@/lib/auth/form-schemas";

export function ForgotPasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [success, setSuccess] = useState(false);
  const form = useZodForm({
    schema: forgotPasswordFormSchema,
    defaultValues: {
      email: "",
    },
  });

  const handleForgotPassword = async (values: ForgotPasswordFormValues) => {
    form.clearErrors();

    try {
      const result = await authClient.requestPasswordReset({
        email: values.email,
        redirectTo: toAbsoluteWebUrl("/auth/update-password"),
      });

      if (result.error) {
        throw result.error;
      }

      setSuccess(true);
    } catch (error: unknown) {
      const formError = getForgotPasswordFormError(error);
      form.setError(formError.target, { message: formError.message });
    }
  };

  const isPending = form.formState.isSubmitting;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {success ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Check Your Email</CardTitle>
            <CardDescription>Password reset instructions sent</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              If you registered using your email and password, you will receive a password reset
              email.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Reset Your Password</CardTitle>
            <CardDescription>
              Type in your email and we&apos;ll send you a link to reset your password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleForgotPassword)}>
                <div className="flex flex-col gap-6">
                  <FormTextField
                    autoComplete="email"
                    control={form.control}
                    label="Email"
                    name="email"
                    placeholder="m@example.com"
                    required
                    type="email"
                  />
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Sending..." : "Send reset email"}
                  </Button>
                </div>
                <div className="mt-4 text-center text-sm">
                  Already have an account?{" "}
                  <Link href="/auth/login" className="underline underline-offset-4">
                    Login
                  </Link>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
