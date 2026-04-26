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
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { getForgotPasswordFormError } from "../lib/auth/form-errors";
import { type ForgotPasswordFormValues, forgotPasswordFormSchema } from "../lib/auth/form-schemas";
import { requestPasswordResetAction } from "../lib/auth/server-actions";
import { AuthCardShell } from "./auth-card-shell";

type ForgotPasswordFormProps = React.ComponentPropsWithoutRef<"div"> & {};

export function ForgotPasswordForm({ className, ...props }: ForgotPasswordFormProps) {
  const requestPasswordReset = useServerFn(requestPasswordResetAction);
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: {
      email: "",
    },
  });
  const handleForgotPassword = form.handleSubmit(async (values) => {
    form.clearErrors();

    try {
      await requestPasswordReset({ data: values });
    } catch (error: unknown) {
      const formError = getForgotPasswordFormError(error);

      if (formError.target === "root") {
        form.setError("root", { message: formError.message });
        return;
      }

      form.setError("email", { message: formError.message });
    }
  });

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AuthCardShell
        title="Reset Your Password"
        description="Type in your email and we&apos;ll send you a link to reset your password"
      >
        <Form {...form}>
          <form
            action={requestPasswordResetAction.url}
            method="post"
            onSubmit={handleForgotPassword}
          >
            <div className="flex flex-col gap-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="email"
                        type="email"
                        placeholder="m@example.com"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.formState.errors.root ? (
                <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
              ) : null}

              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Sending..." : "Send reset email"}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Already have an account?{" "}
              <Link
                to="/auth/login"
                search={{ flash: undefined, flashType: undefined, redirect: undefined }}
                className="underline underline-offset-4"
              >
                Login
              </Link>
            </div>
          </form>
        </Form>
      </AuthCardShell>
    </div>
  );
}
