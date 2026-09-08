import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";

import { AuthCardShell } from "../../components/auth-card-shell";
import { RouteFlashToast, type RouteFlashType } from "../../components/route-flash-toast";
import { publicAuthPageMiddleware, resolveRouteAuthSession } from "../../lib/auth/route-guards";
import { sendVerificationEmailAction } from "../../lib/auth/server-actions";
import { getVerificationEmail } from "../../lib/auth/verification-email";
import { contractEpochFormInputProps } from "../../lib/contract-epoch";

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
  server: {
    middleware: publicAuthPageMiddleware,
  },
  beforeLoad: async ({ serverContext }) => {
    const session = await resolveRouteAuthSession(serverContext);
    return { authenticatedEmail: session?.user.email };
  },
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const navigate = Route.useNavigate();
  const { email, flash, flashType, source } = Route.useSearch();
  const { authenticatedEmail } = Route.useRouteContext();
  const verificationEmail = getVerificationEmail(email, authenticatedEmail);
  const description =
    source === "sign-up"
      ? `Check your inbox for a verification link for ${verificationEmail ?? "your email"}. If it does not arrive, resend it below.`
      : `Check your inbox for a verification link sent to ${verificationEmail ?? "your email"}.`;

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
              <input {...contractEpochFormInputProps} />
              <input type="hidden" name="email" value={verificationEmail ?? ""} />
              <input type="hidden" name="source" value={source ?? ""} />
              <Button type="submit" className="w-full" disabled={!verificationEmail}>
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
