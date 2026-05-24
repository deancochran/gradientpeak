import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";

import { AuthCardShell } from "../../components/auth-card-shell";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { sendVerificationEmailAction } from "../../lib/auth/server-actions";

export const Route = createFileRoute("/auth/verify")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === "string" ? search.email : undefined,
    flash: typeof search.flash === "string" ? search.flash : undefined,
    flashType:
      search.flashType === "success" || search.flashType === "error" || search.flashType === "info"
        ? (search.flashType as RouteFlashType)
        : undefined,
    source: typeof search.source === "string" ? search.source : undefined,
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = Route.useNavigate();
  const { email, flash, flashType, source } = Route.useSearch();
  const description =
    source === "sign-up"
      ? `Check your inbox for a verification link for ${email ?? "your email"}. If it does not arrive, resend it below.`
      : `Check your inbox for a verification link sent to ${email ?? "your email"}.`;

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6 md:py-10">
      <div className="w-full max-w-sm space-y-4">
        <RouteFlashToast
          message={flash}
          type={flashType}
          clear={() =>
            void navigate({
              to: "/auth/verify",
              search: { email, flash: undefined, flashType: undefined, source },
              replace: true,
            })
          }
        />
        <AuthCardShell title="Verify Email" description={description}>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Open the verification email on this device. If you already verified this account, you
              can return to sign in.
            </p>
            <form action={sendVerificationEmailAction.url} method="post" className="space-y-3">
              <input type="hidden" name="email" value={email ?? ""} />
              <input type="hidden" name="source" value={source ?? ""} />
              <Button type="submit" className="w-full" disabled={!email}>
                Resend Verification Email
              </Button>
            </form>
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
