import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import {
  OrganizationSelector,
  OrganizationSelectorError,
  OrganizationSelectorFrame,
  OrganizationSelectorPending,
} from "../../../components/coaching/organization-selector";
import { loadMyOrganizations } from "../../../lib/coaching/server-functions";

const PAGE_SIZE = 20;
const organizationSearchSchema = z
  .object({ cursor: z.string().min(1).max(1024).optional() })
  .strict();

export const Route = createFileRoute("/_coaching/organizations/")({
  validateSearch: (search) => organizationSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ cursor: search.cursor ?? null }),
  loader: ({ deps }) => loadMyOrganizations({ data: { limit: PAGE_SIZE, cursor: deps.cursor } }),
  pendingComponent: OrganizationSelectorPending,
  errorComponent: OrganizationSelectorError,
  component: OrganizationsPage,
});

function OrganizationsPage() {
  const page = Route.useLoaderData();
  const { cursor } = Route.useSearch();

  return (
    <OrganizationSelectorFrame heading="Coaching organizations">
      <div className="space-y-6">
        <p className="max-w-2xl text-sm leading-6 text-slate-400">
          Select an organization explicitly. Athlete views are not available here, and your Personal
          workspace is always separate.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/organizations/new">Create organization</Link>
          </Button>
          <Button asChild variant="outline" className="border-slate-700 text-slate-100">
            <Link to="/">Personal workspace</Link>
          </Button>
        </div>
        <OrganizationSelector page={page} {...(cursor === undefined ? {} : { cursor })} />
      </div>
    </OrganizationSelectorFrame>
  );
}
