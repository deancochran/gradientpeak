import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Link, useRouter } from "@tanstack/react-router";

const ROLE_LABELS = {
  admin: "Admin",
  coach: "Coach",
} as const;

type FixedRole = keyof typeof ROLE_LABELS;

type OrganizationPage = {
  items: Array<{
    organization: { organizationId: string; name: string };
    membership: { roles: readonly string[] };
    isRootOwner: boolean;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
};

export function OrganizationSelector({
  page,
  cursor,
}: {
  page: OrganizationPage;
  cursor?: string;
}) {
  if (page.items.length === 0) {
    return cursor ? <EmptyCursorPage /> : <NoOrganizations />;
  }

  return (
    <section aria-labelledby="organization-list-heading" className="space-y-4">
      <div>
        <h2 id="organization-list-heading" className="text-xl font-semibold text-white">
          Your organizations
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Choose a coaching workspace to continue. Your Personal workspace stays separate.
        </p>
      </div>
      <ul className="grid gap-4" aria-label="Coaching organizations">
        {page.items.map(({ organization, membership, isRootOwner }) => {
          const opensAdministration = isRootOwner || membership.roles.includes("admin");
          const defaultWorkspace = opensAdministration
            ? "/organizations/$organizationId/dashboard"
            : "/organizations/$organizationId/coaching";

          return (
            <li key={organization.organizationId}>
              <Card className="border-slate-800 bg-slate-900 text-slate-50">
                <CardHeader>
                  <CardTitle>
                    <h3>{organization.name}</h3>
                  </CardTitle>
                  <CardDescription className="flex flex-wrap gap-2 text-slate-400">
                    {membership.roles.filter(isFixedRole).map((role) => (
                      <Badge key={role} className="border-slate-700 bg-slate-800 text-slate-200">
                        {ROLE_LABELS[role]}
                      </Badge>
                    ))}
                    {isRootOwner ? (
                      <Badge className="border-cyan-700 bg-cyan-950 text-cyan-200">
                        Root owner
                      </Badge>
                    ) : null}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" className="border-slate-700 text-slate-100">
                    <Link
                      to={defaultWorkspace}
                      params={{ organizationId: organization.organizationId }}
                    >
                      Open {organization.name} coaching{" "}
                      {opensAdministration ? "dashboard" : "workspace"}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
      <Pagination
        nextCursor={page.nextCursor}
        hasMore={page.hasMore}
        {...(cursor === undefined ? {} : { cursor })}
      />
    </section>
  );
}

export function OrganizationSelectorFrame({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="gp-protected-shell min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center px-4 sm:px-6">
          <span className="text-sm font-semibold">GradientPeak Coaching</span>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="ml-auto border-slate-700 bg-transparent text-slate-200 hover:bg-slate-900 hover:text-white"
          >
            <Link to="/">Personal workspace</Link>
          </Button>
        </div>
      </header>
      <main
        aria-labelledby="organizations-heading"
        className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6"
      >
        <h1 id="organizations-heading" className="text-3xl font-semibold tracking-tight text-white">
          {heading}
        </h1>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

export function OrganizationSelectorPending() {
  return (
    <OrganizationSelectorFrame heading="Loading organizations">
      <p role="status" aria-live="polite" className="text-sm text-slate-400">
        Loading your coaching workspaces…
      </p>
    </OrganizationSelectorFrame>
  );
}

export function OrganizationSelectorError() {
  const router = useRouter();

  return (
    <OrganizationSelectorFrame heading="Organizations unavailable">
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardContent className="flex flex-wrap items-center gap-3 py-6">
          <p role="alert" className="text-sm text-slate-400">
            We could not load your coaching organizations.
          </p>
          <Button onClick={() => void router.invalidate()}>Retry</Button>
        </CardContent>
      </Card>
    </OrganizationSelectorFrame>
  );
}

function isFixedRole(role: string): role is FixedRole {
  return Object.hasOwn(ROLE_LABELS, role);
}

function NoOrganizations() {
  return (
    <section aria-labelledby="no-organizations-heading">
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>
            <h2 id="no-organizations-heading">No coaching organizations</h2>
          </CardTitle>
          <CardDescription className="text-slate-400">
            No active coaching organization is available for this profile. You can create one or
            return here after accepting an organization invitation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/organizations/new">Create organization</Link>
          </Button>
          <Button asChild variant="outline" className="border-slate-700 text-slate-100">
            <Link to="/">Go to Personal workspace</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function EmptyCursorPage() {
  return (
    <section aria-labelledby="empty-organization-page-heading">
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>
            <h2 id="empty-organization-page-heading">No organizations on this page</h2>
          </CardTitle>
          <CardDescription className="text-slate-400">
            This saved page no longer has organizations to show.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="border-slate-700 text-slate-100">
            <Link to="/organizations" search={{ cursor: undefined }}>
              Back to first page
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function Pagination({
  nextCursor,
  hasMore,
  cursor,
}: {
  nextCursor: string | null;
  hasMore: boolean;
  cursor?: string;
}) {
  if (!cursor && !hasMore) return null;

  return (
    <nav aria-label="Organization pages" className="flex flex-wrap gap-3">
      {cursor ? (
        <Button asChild variant="outline" className="border-slate-700 text-slate-100">
          <Link to="/organizations" search={{ cursor: undefined }}>
            First page
          </Link>
        </Button>
      ) : null}
      {hasMore && nextCursor ? (
        <Button asChild>
          <Link to="/organizations" search={{ cursor: nextCursor }}>
            Next page
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}
