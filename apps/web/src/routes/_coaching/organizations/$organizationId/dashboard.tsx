import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { CoachAccessDenied } from "../../../../components/coaching/coach-access-denied";
import { OrganizationManagementOverview } from "../../../../components/coaching/organization-management-overview";
import {
  OrganizationOverviewError,
  OrganizationOverviewFrame,
  OrganizationOverviewPending,
} from "../../../../components/coaching/organization-overview-frame";
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
  pendingComponent: DashboardPending,
  errorComponent: DashboardError,
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
    return <OrganizationOverviewPending organizationId={organizationId} />;
  const { overview } = loaded;
  if (overview.status === "forbidden") return <CoachAccessDenied />;

  return (
    <OrganizationOverviewFrame organizationId={organizationId}>
      <OrganizationManagementOverview organizationId={organizationId} overview={overview} />
    </OrganizationOverviewFrame>
  );
}

function DashboardPending() {
  const { organizationId } = Route.useParams();
  return <OrganizationOverviewPending organizationId={organizationId} />;
}

function DashboardError() {
  const { organizationId } = Route.useParams();
  return <OrganizationOverviewError organizationId={organizationId} />;
}
