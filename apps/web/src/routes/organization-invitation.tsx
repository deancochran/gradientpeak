import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/organization-invitation")({
  component: OrganizationInvitationEntry,
});

function OrganizationInvitationEntry() {
  useEffect(() => {
    window.location.replace("/organization-invitations");
  }, []);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg items-center px-4 py-8">
      <section aria-labelledby="organization-invitation-heading" className="space-y-4">
        <h1 id="organization-invitation-heading" className="text-2xl font-semibold">
          Continue to your organization invitation
        </h1>
        <p className="text-muted-foreground">
          Continue to sign in, complete any required setup, and review the invitation before you
          accept or decline it.
        </p>
        <Button asChild>
          <Link to="/organization-invitations">Continue</Link>
        </Button>
        <noscript>
          <p className="text-sm text-muted-foreground">
            JavaScript is required to securely open an invitation link. Sign in, then paste the
            invitation token manually on the Organization invitations page.
          </p>
        </noscript>
      </section>
    </main>
  );
}
