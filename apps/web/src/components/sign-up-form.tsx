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
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toAbsoluteAppUrl } from "../lib/app-url";
import { authClient } from "../lib/auth/client";
import { getSignUpFormError } from "../lib/auth/form-errors";
import { type SignUpFormValues, signUpFormSchema } from "../lib/auth/form-schemas";

export function SignUpForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [errors, setErrors] = useState<
    Partial<Record<"email" | "password" | "repeatPassword" | "root", string>>
  >({});
  const [isPending, setIsPending] = useState(false);

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = signUpFormSchema.safeParse({ email, password, repeatPassword });

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
        repeatPassword: fieldErrors.repeatPassword?.[0],
      });
      return;
    }

    const values: SignUpFormValues = parsed.data;
    setErrors({});
    setIsPending(true);

    try {
      const result = await authClient.signUp.email({
        email: values.email,
        password: values.password,
        name: values.email.split("@")[0] || values.email,
        callbackURL: toAbsoluteAppUrl("/auth/confirm"),
      });

      if (result.error) {
        throw result.error;
      }

      await navigate({ to: "/auth/sign-up-success" });
    } catch (error: unknown) {
      const formError = getSignUpFormError(error);
      setErrors((current) => ({ ...current, [formError.target]: formError.message }));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign up</CardTitle>
          <CardDescription>Create a new account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp}>
            <div className="flex flex-col gap-6">
              <div className="space-y-2">
                <Label htmlFor="sign-up-email">Email *</Label>
                <Input
                  id="sign-up-email"
                  autoComplete="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  aria-invalid={Boolean(errors.email)}
                />
                {errors.email ? <p className="text-destructive text-sm">{errors.email}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="sign-up-password">Password *</Label>
                <Input
                  id="sign-up-password"
                  autoComplete="new-password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  aria-invalid={Boolean(errors.password)}
                />
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Password must contain:</p>
                  <p>• At least 8 characters</p>
                  <p>• One uppercase letter</p>
                  <p>• One number</p>
                </div>
                {errors.password ? (
                  <p className="text-destructive text-sm">{errors.password}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="sign-up-repeat-password">Repeat Password *</Label>
                <Input
                  id="sign-up-repeat-password"
                  autoComplete="new-password"
                  type="password"
                  placeholder="Confirm your password"
                  value={repeatPassword}
                  onChange={(event) => setRepeatPassword(event.currentTarget.value)}
                  aria-invalid={Boolean(errors.repeatPassword)}
                />
                {errors.repeatPassword ? (
                  <p className="text-destructive text-sm">{errors.repeatPassword}</p>
                ) : null}
              </div>

              {errors.root ? <p className="text-destructive text-sm">{errors.root}</p> : null}

              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating an account..." : "Sign up"}
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
    </div>
  );
}
