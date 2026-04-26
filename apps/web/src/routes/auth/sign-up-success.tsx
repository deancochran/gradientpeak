import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";

import { AuthCardShell } from "../../components/auth-card-shell";

export const Route = createFileRoute("/auth/sign-up-success")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === "string" ? search.email : undefined,
  }),
  component: SignUpSuccessPage,
});

function SignUpSuccessPage() {
  const { email } = Route.useSearch();

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6 md:py-10">
      <div className="w-full max-w-sm">
        <AuthCardShell
          title="Thank you for signing up"
          description="Check your email to confirm your account."
        >
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              We sent a verification link to {email ?? "your email"}. Open it on this device to
              finish setting up your account.
            </p>
            <Button asChild className="w-full">
              <Link
                to="/auth/verify"
                search={{ email, flash: undefined, flashType: undefined, source: "sign-up" }}
              >
                Continue to Verification
              </Link>
            </Button>
            <Button asChild variant="link" className="w-full px-0">
              <Link
                to="/auth/login"
                search={{ flash: undefined, flashType: undefined, redirect: undefined }}
              >
                Back to Sign In
              </Link>
            </Button>
          </div>
        </AuthCardShell>
      </div>
    </div>
  );
}
