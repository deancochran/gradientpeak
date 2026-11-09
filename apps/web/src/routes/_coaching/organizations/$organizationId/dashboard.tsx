import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { CoachAccessDenied } from "../../../../components/coaching/coach-access-denied";
import { OrganizationManagementOverview } from "../../../../components/coaching/organization-management-overview";
import { loadOrganizationManagementOverview } from "../../../../lib/coaching/server-functions";

export const Route = createFileRoute("/_coaching/organizations/$organizationId/dashboard")({
  loader: async ({ params, context }) => ({
    organizationId: params.organizationId,
    actorProfileId: context.actorProfileId,
    overview: await loadOrganizationManagementOverview({
      data: { organizationId: params.organizationId },
    }),
  }),
  pendingMs: 0,
  pendingComponent: () => <p role="status">Loading organization overview…</p>,
  component: CoachDashboardPage,
});

function CoachDashboardPage() {
  const loaded = Route.useLoaderData();
  const { organizationId } = Route.useParams();
  const { actorProfileId } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const dashboardPath = `/organizations/${organizationId}/dashboard`;
  if (
    (pathname !== dashboardPath && pathname !== `${dashboardPath}/`) ||
    loaded.organizationId !== organizationId ||
    loaded.actorProfileId !== actorProfileId
  )
    return <p role="status">Loading organization overview…</p>;
  const { overview } = loaded;
  if (overview.status === "forbidden") return <CoachAccessDenied />;

  return (
    <div className="space-y-6">
      <nav aria-label="Organization administration" className="flex flex-wrap gap-3">
        <Link
          to="/organizations/$organizationId/staff"
          params={{ organizationId }}
          search={{ status: "active", cursor: undefined }}
          className="inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Manage staff
        </Link>
        <Link
          to="/organizations/$organizationId/athletes"
          params={{ organizationId }}
          className="inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Manage athletes
        </Link>
        <Link
          to="/organizations/$organizationId/assignments"
          params={{ organizationId }}
          className="inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Manage coach assignments
        </Link>
        <Link
          to="/organizations/$organizationId/invitations"
          params={{ organizationId }}
          className="inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Manage invitations
        </Link>
        <Link
          to="/organizations/$organizationId/groups"
          params={{ organizationId }}
          className="inline-flex rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Manage organization groups
        </Link>
      </nav>
      <OrganizationManagementOverview organizationId={organizationId} overview={overview} />
    </div>
  );
}
