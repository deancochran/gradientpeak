"use client";

import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormTextField,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { useZodForm } from "@repo/ui/hooks";
import { cn } from "@repo/ui/lib/cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { getLoginFormError } from "@/lib/auth/form-errors";
import { type LoginFormValues, loginFormSchema } from "@/lib/auth/form-schemas";
import { useAuth } from "./providers/auth-provider";

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const form = useZodForm({
    schema: loginFormSchema,
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const handleLogin = async (values: LoginFormValues) => {
    form.clearErrors("root");

    try {
      const result = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });

      if (result.error) {
        throw result.error;
      }

      await refreshSession();
      router.refresh();
      router.push("/");
    } catch (error: unknown) {
      const formError = getLoginFormError(error);
      form.setError(formError.target, { message: formError.message });
    }
  };

  const isPending = form.formState.isSubmitting;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Login</CardTitle>
          <CardDescription>Enter your email below to login to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)}>
              <div className="flex flex-col gap-6">
                <FormTextField
                  autoComplete="email"
                  control={form.control}
                  label="Email"
                  name="email"
                  placeholder="m@example.com"
                  required
                  testId="login-email-input"
                  type="email"
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-3">
                        <FormLabel>Password *</FormLabel>
                        <Link
                          href="/auth/forgot-password"
                          className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                        >
                          Forgot your password?
                        </Link>
                      </div>
                      <FormControl>
                        <Input
                          autoComplete="current-password"
                          onBlur={field.onBlur}
                          onChange={(event) => field.onChange(event.currentTarget.value)}
                          testId="login-password-input"
                          type="password"
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.formState.errors.root?.message ? (
                  <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
                ) : null}
                <Button disabled={isPending} testId="login-submit-button" type="submit">
                  {isPending ? "Logging in..." : "Login"}
                </Button>
              </div>
              <div className="mt-4 text-center text-sm">
                Don&apos;t have an account?{" "}
                <Link href="/auth/sign-up" className="underline underline-offset-4">
                  Sign up
                </Link>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
