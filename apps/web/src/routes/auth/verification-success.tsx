import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";

import { AuthCardShell } from "../../components/auth-card-shell";

export const Route = createFileRoute("/auth/verification-success")({
  component: VerificationSuccessPage,
});

function VerificationSuccessPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6 md:py-10">
      <div className="w-full max-w-sm">
        <AuthCardShell
          title="Account Verified"
          description="Your email has been verified successfully."
        >
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>You can sign in now and continue setting up your GradientPeak account.</p>
            <Button asChild className="w-full">
              <Link
                to="/auth/login"
                search={{ flash: undefined, flashType: undefined, redirect: undefined }}
              >
                Sign In Now
              </Link>
            </Button>
          </div>
        </AuthCardShell>
      </div>
    </div>
  );
}
