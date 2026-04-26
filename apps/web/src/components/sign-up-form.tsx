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

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="new-password"
                        type="password"
                        placeholder="Enter your password"
                      />
                    </FormControl>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p>Password must contain:</p>
                      <p>At least 8 characters</p>
                      <p>One uppercase letter</p>
                      <p>One number</p>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="repeatPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repeat Password *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="new-password"
                        type="password"
                        placeholder="Confirm your password"
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
                {form.formState.isSubmitting ? "Creating an account..." : "Sign up"}
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
