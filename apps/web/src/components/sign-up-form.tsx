import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormTextField } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { cn } from "@repo/ui/lib/cn";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { getSignUpFormError } from "../lib/auth/form-errors";
import { type SignUpFormValues, signUpFormSchema } from "../lib/auth/form-schemas";
import { signUpWithEmailAction } from "../lib/auth/server-actions";
import { AuthCardShell } from "./auth-card-shell";

export function SignUpForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const signUp = useServerFn(signUpWithEmailAction);
  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: {
      email: "",
      password: "",
      repeatPassword: "",
    },
  });

  const handleSignUp = form.handleSubmit(async (values) => {
    form.clearErrors();

    try {
      await signUp({ data: values });
    } catch (error: unknown) {
      const formError = getSignUpFormError(error);

      if (formError.target === "root") {
        form.setError("root", { message: formError.message });
        return;
      }

      form.setError(formError.target, { message: formError.message });
    }
  });

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AuthCardShell title="Sign up" description="Create a new account">
        <Form {...form}>
          <form action={signUpWithEmailAction.url} method="post" onSubmit={handleSignUp}>
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
                description="Password must contain: At least 8 characters. One uppercase letter. One number."
                label="Password"
                name="password"
                placeholder="Enter your password"
                required
                type="password"
              />

              <FormTextField
                autoComplete="new-password"
                control={form.control}
                label="Repeat Password"
                name="repeatPassword"
                placeholder="Confirm your password"
                required
                type="password"
              />

              {form.formState.errors.root ? (
                <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
              ) : null}

              <LoadingButton
                disabled={form.formState.isSubmitting}
                loading={form.formState.isSubmitting}
                loadingLabel="Creating an account..."
                type="submit"
              >
                Sign up
              </LoadingButton>
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
