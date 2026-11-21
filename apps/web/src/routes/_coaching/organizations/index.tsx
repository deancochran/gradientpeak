import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  OrganizationSelector,
  OrganizationSelectorError,
  OrganizationSelectorFrame,
  OrganizationSelectorPending,
} from "../../../components/coaching/organization-selector";
import {
  loadMyOrganizations,
  loadMyPendingOrganizationInvitations,
} from "../../../lib/coaching/server-functions";

const PAGE_SIZE = 20;
const organizationSearchSchema = z
  .object({ cursor: z.string().min(1).max(1024).optional() })
  .strict();

export const Route = createFileRoute("/_coaching/organizations/")({
  validateSearch: (search) => organizationSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ cursor: search.cursor ?? null }),
  loader: async ({ deps }) => {
    const page = await loadMyOrganizations({ data: { limit: PAGE_SIZE, cursor: deps.cursor } });
    try {
      return {
        page,
        invitations: {
          status: "available" as const,
          ...(await loadMyPendingOrganizationInvitations({ data: { limit: PAGE_SIZE } })),
        },
      };
    } catch {
      // Invitation status is secondary to the accepted-membership chooser. Preserve usable
      // membership destinations and expose an explicit recovery instead of treating failure as empty.
      return { page, invitations: { status: "unavailable" as const } };
    }
  },
  pendingComponent: OrganizationSelectorPending,
  errorComponent: OrganizationSelectorError,
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const { page, invitations } = Route.useLoaderData();
  const { cursor } = Route.useSearch();

  return (
    <OrganizationSelectorFrame heading="Coaching organizations">
      <div className="space-y-6">
        <p className="max-w-2xl text-sm leading-6 text-slate-400">
          Select an organization explicitly. Athlete views are not available here, and your Personal
          workspace is always separate.
        </p>
        <div className="flex min-w-0 flex-wrap gap-3">
          <Button
            asChild
            className="h-auto max-w-full whitespace-normal bg-cyan-400 text-slate-950 hover:bg-cyan-300"
          >
            <Link to="/organizations/new">Create organization</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-auto max-w-full whitespace-normal border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
          >
            <Link to="/organization-invitations">My organization invitations</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-auto max-w-full whitespace-normal border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
          >
            <Link to="/">Personal workspace</Link>
          </Button>
        </div>
        <OrganizationSelector
          page={page}
          invitations={invitations}
          {...(cursor === undefined ? {} : { cursor })}
        />
      </div>
    </OrganizationSelectorFrame>
  );
}
