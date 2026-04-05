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
import { useRouter } from "next/navigation";
import { authClient, toAbsoluteWebUrl } from "@/lib/auth/client";
import { getSignUpFormError } from "@/lib/auth/form-errors";
import { type SignUpFormValues, signUpFormSchema } from "@/lib/auth/form-schemas";

export function SignUpForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const router = useRouter();
  const form = useZodForm({
    schema: signUpFormSchema,
    defaultValues: {
      email: "",
      password: "",
      repeatPassword: "",
    },
  });

  const handleSignUp = async (values: SignUpFormValues) => {
    form.clearErrors("root");

    try {
      const result = await authClient.signUp.email({
        email: values.email,
        password: values.password,
        name: values.email.split("@")[0] || values.email,
        callbackURL: toAbsoluteWebUrl("/auth/confirm"),
      });

      if (result.error) {
        throw result.error;
      }

      router.push("/auth/sign-up-success");
    } catch (error: unknown) {
      const formError = getSignUpFormError(error);
      form.setError(formError.target, { message: formError.message });
    }
  };

  const isPending = form.formState.isSubmitting;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign up</CardTitle>
          <CardDescription>Create a new account</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSignUp)}>
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
                <FormTextField
                  autoComplete="new-password"
                  control={form.control}
                  label="Password"
                  name="password"
                  placeholder="Enter your password"
                  required
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
                  label="Repeat Password"
                  name="repeatPassword"
                  placeholder="Confirm your password"
                  required
                  type="password"
                />
                {form.formState.errors.root?.message ? (
                  <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
                ) : null}
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Creating an account..." : "Sign up"}
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
    </div>
  );
}
