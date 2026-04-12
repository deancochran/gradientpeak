import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { cn } from "@repo/ui/lib/cn";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toAbsoluteAppUrl } from "../lib/app-url";
import { authClient } from "../lib/auth/client";
import { getForgotPasswordFormError } from "../lib/auth/form-errors";
import { type ForgotPasswordFormValues, forgotPasswordFormSchema } from "../lib/auth/form-schemas";

export function ForgotPasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const handleForgotPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = forgotPasswordFormSchema.safeParse({ email });

    if (!parsed.success) {
      setEmailError(parsed.error.flatten().fieldErrors.email?.[0] ?? "Enter a valid email address");
      return;
    }

    const values: ForgotPasswordFormValues = parsed.data;
    setEmailError(null);
    setIsPending(true);

    try {
      const result = await authClient.requestPasswordReset({
        email: values.email,
        redirectTo: toAbsoluteAppUrl("/auth/update-password"),
      });

      if (result.error) {
        throw result.error;
      }

      setSuccess(true);
    } catch (error: unknown) {
      const formError = getForgotPasswordFormError(error);
      setEmailError(formError.message);
    } finally {
      setIsPending(false);
    }
  };

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
            <form onSubmit={handleForgotPassword}>
              <div className="flex flex-col gap-6">
                <div className="space-y-2">
                  <Label htmlFor="forgot-password-email">Email *</Label>
                  <Input
                    id="forgot-password-email"
                    autoComplete="email"
                    type="email"
                    placeholder="m@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    aria-invalid={Boolean(emailError)}
                  />
                  {emailError ? <p className="text-destructive text-sm">{emailError}</p> : null}
                </div>

                <Button type="submit" disabled={isPending}>
                  {isPending ? "Sending..." : "Send reset email"}
                </Button>
              </div>
              <div className="mt-4 text-center text-sm">
                Already have an account?{" "}
                <Link to="/auth/login" className="underline underline-offset-4">
                  Login
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
