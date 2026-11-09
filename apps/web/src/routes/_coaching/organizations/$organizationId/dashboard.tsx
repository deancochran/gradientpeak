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
      <nav
        aria-label="Organization administration"
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      >
        <Link
          to="/organizations/$organizationId/dashboard"
          params={{ organizationId }}
          aria-current="page"
          className="inline-flex shrink-0 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Overview
        </Link>
        <Link
          to="/organizations/$organizationId/staff"
          params={{ organizationId }}
          search={{ status: "active", cursor: undefined }}
          className="inline-flex shrink-0 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Staff
        </Link>
        <Link
          to="/organizations/$organizationId/athletes"
          params={{ organizationId }}
          className="inline-flex shrink-0 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Athletes
        </Link>
        <Link
          to="/organizations/$organizationId/assignments"
          params={{ organizationId }}
          className="inline-flex shrink-0 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Assignments
        </Link>
        <Link
          to="/organizations/$organizationId/invitations"
          params={{ organizationId }}
          className="inline-flex shrink-0 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Invitations
        </Link>
        <Link
          to="/organizations/$organizationId/groups"
          params={{ organizationId }}
          className="inline-flex shrink-0 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Groups
        </Link>
        <Link
          to="/organizations/$organizationId/audit"
          params={{ organizationId }}
          className="inline-flex shrink-0 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Audit
        </Link>
      </nav>
      <OrganizationManagementOverview organizationId={organizationId} overview={overview} />
    </div>
  );
}
