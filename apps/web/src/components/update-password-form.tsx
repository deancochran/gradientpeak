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
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../lib/auth/client";
import { getUpdatePasswordFormError } from "../lib/auth/form-errors";
import { type UpdatePasswordFormValues, updatePasswordFormSchema } from "../lib/auth/form-schemas";

export function UpdatePasswordForm({
  className,
  token,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { token?: string }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<
    Partial<Record<"password" | "confirmPassword" | "root", string>>
  >({});
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setErrors({ root: "Missing or invalid reset token" });
      return;
    }

    const parsed = updatePasswordFormSchema.safeParse({ password, confirmPassword });

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors({
        password: fieldErrors.password?.[0],
        confirmPassword: fieldErrors.confirmPassword?.[0],
      });
      return;
    }

    const values: UpdatePasswordFormValues = parsed.data;
    setErrors({});
    setIsPending(true);

    try {
      const result = await authClient.resetPassword({
        newPassword: values.password,
        token,
      });

      if (result.error) {
        throw result.error;
      }

      await navigate({ to: "/auth/login" });
    } catch (error: unknown) {
      const formError = getUpdatePasswordFormError(error);
      setErrors((current) => ({ ...current, [formError.target]: formError.message }));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Reset Your Password</CardTitle>
          <CardDescription>Please enter your new password below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="space-y-2">
                <Label htmlFor="update-password-password">New password *</Label>
                <Input
                  id="update-password-password"
                  autoComplete="new-password"
                  type="password"
                  placeholder="New password"
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
                {errors.password ? <p className="text-destructive text-sm">{errors.password}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="update-password-confirm">Confirm password *</Label>
                <Input
                  id="update-password-confirm"
                  autoComplete="new-password"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                  aria-invalid={Boolean(errors.confirmPassword)}
                />
                {errors.confirmPassword ? (
                  <p className="text-destructive text-sm">{errors.confirmPassword}</p>
                ) : null}
              </div>

              {errors.root ? <p className="text-destructive text-sm">{errors.root}</p> : null}

              <Button type="submit" disabled={isPending || !token}>
                {isPending ? "Saving..." : "Save new password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
