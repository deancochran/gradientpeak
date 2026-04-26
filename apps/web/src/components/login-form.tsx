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
import { getLoginFormError } from "../lib/auth/form-errors";
import { type LoginFormValues, loginFormSchema } from "../lib/auth/form-schemas";
import { signInWithEmailAction } from "../lib/auth/server-actions";
import { AuthCardShell } from "./auth-card-shell";

type LoginFormProps = React.ComponentPropsWithoutRef<"div"> & {
  redirectTo?: string;
};

export function LoginForm({ className, redirectTo, ...props }: LoginFormProps) {
  const signIn = useServerFn(signInWithEmailAction);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const handleLogin = form.handleSubmit(async (values) => {
    form.clearErrors();

    try {
      await signIn({ data: { ...values, redirect: redirectTo } });
    } catch (error: unknown) {
      const formError = getLoginFormError(error);

      if (formError.target === "root") {
        form.setError("root", { message: formError.message });
        return;
      }

      form.setError(formError.target, { message: formError.message });
    }
  });

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <AuthCardShell title="Login" description="Enter your email below to login to your account">
        <Form {...form}>
          <form action={signInWithEmailAction.url} method="post" onSubmit={handleLogin}>
            <input type="hidden" name="redirect" value={redirectTo ?? ""} />
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
                    <div className="flex items-center justify-between gap-3">
                      <FormLabel>Password *</FormLabel>
                      <Link
                        to="/auth/forgot-password"
                        search={{ flash: undefined, flashType: undefined }}
                        className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                      >
                        Forgot your password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input {...field} autoComplete="current-password" type="password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.formState.errors.root ? (
                <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
              ) : null}

              <Button disabled={form.formState.isSubmitting} type="submit">
                {form.formState.isSubmitting ? "Logging in..." : "Login"}
              </Button>
            </div>
            <div className="mt-4 text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link
                to="/auth/sign-up"
                search={{ flash: undefined, flashType: undefined }}
                className="underline underline-offset-4"
              >
                Sign up
              </Link>
            </div>
          </form>
        </Form>
      </AuthCardShell>

      <p className="text-center text-sm text-muted-foreground">
        Returning to the main app?{" "}
        <Link to="/" className="underline underline-offset-4">
          Go back
        </Link>
      </p>
    </div>
  );
}
