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
import { authClient } from "../lib/auth/client";
import { getLoginFormError } from "../lib/auth/form-errors";
import { type LoginFormValues, loginFormSchema } from "../lib/auth/form-schemas";
import { useAuth } from "./providers/auth-provider";

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const navigate = useNavigate();
  const { refreshSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"email" | "password" | "root", string>>>({});
  const [isPending, setIsPending] = useState(false);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = loginFormSchema.safeParse({ email, password });

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      });
      return;
    }

    const values: LoginFormValues = parsed.data;
    setErrors({});
    setIsPending(true);

    try {
      const result = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (result.error) {
        throw result.error;
      }

      await refreshSession();
      await navigate({ to: "/", replace: true });
    } catch (error: unknown) {
      const formError = getLoginFormError(error);
      setErrors((current) => ({ ...current, [formError.target]: formError.message }));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>Enter your email below to login to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email *</Label>
                <Input
                  id="login-email"
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
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="login-password">Password *</Label>
                  <Link
                    to="/auth/forgot-password"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <Input
                  id="login-password"
                  autoComplete="current-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  aria-invalid={Boolean(errors.password)}
                />
                {errors.password ? (
                  <p className="text-destructive text-sm">{errors.password}</p>
                ) : null}
              </div>

              {errors.root ? <p className="text-destructive text-sm">{errors.root}</p> : null}

              <Button disabled={isPending} type="submit">
                {isPending ? "Logging in..." : "Login"}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link to="/auth/sign-up" className="underline underline-offset-4">
                Sign up
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Returning to the main app?{" "}
        <Link to="/" className="underline underline-offset-4">
          Go back
        </Link>
      </p>
    </div>
  );
}
