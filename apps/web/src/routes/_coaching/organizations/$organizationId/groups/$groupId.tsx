import { createFileRoute, Link, Outlet, useMatches, useRouterState } from "@tanstack/react-router";
import { CoachAccessDenied } from "../../../../../components/coaching/coach-access-denied";
import {
  OrganizationGroupDetail,
  OrganizationGroupDetailError,
  OrganizationGroupDetailPending,
} from "../../../../../components/coaching/organization-groups/organization-group-detail";
import { loadOrganizationGroup } from "../../../../../lib/coaching/organization-groups-server-functions";

export const Route = createFileRoute("/_coaching/organizations/$organizationId/groups/$groupId")({
  loader: async ({ params, context }) => ({
    organizationId: params.organizationId,
    actorProfileId: context.actorProfileId,
    groupId: params.groupId,
    result: await loadOrganizationGroup({ data: params }),
  }),
  pendingMs: 0,
  pendingComponent: OrganizationGroupDetailPending,
  errorComponent: OrganizationGroupDetailError,
  component: OrganizationGroupDetailPage,
});
function OrganizationGroupDetailPage() {
  const loaded = Route.useLoaderData();
  const { organizationId, groupId } = Route.useParams();
  const { actorProfileId } = Route.useRouteContext();
  const childForbidden = useMatches({
    select: (matches) =>
      matches.some((match) => {
        const childRoute =
          match.routeId === "/_coaching/organizations/$organizationId/groups/$groupId/coaches" ||
          match.routeId === "/_coaching/organizations/$organizationId/groups/$groupId/athletes";
        const params = match.params as { organizationId?: string; groupId?: string };
        const result = match.loaderData as
          | { status?: unknown; actorProfileId?: string; result?: { status?: unknown } }
          | undefined;
        return (
          childRoute &&
          params.organizationId === organizationId &&
          params.groupId === groupId &&
          result?.actorProfileId === actorProfileId &&
          result?.result?.status === "forbidden"
        );
      }),
  });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const groupPath = `/organizations/${organizationId}/groups/${groupId}`;
  const normalizedPath =
    pathname.endsWith("/") && pathname !== groupPath ? pathname.slice(0, -1) : pathname;
  const validGroupPath =
    normalizedPath === groupPath ||
    normalizedPath === `${groupPath}/coaches` ||
    normalizedPath === `${groupPath}/athletes`;
  if (
    !validGroupPath ||
    loaded.organizationId !== organizationId ||
    loaded.actorProfileId !== actorProfileId ||
    loaded.groupId !== groupId
  )
    return <OrganizationGroupDetailPending />;
  if (loaded.result.status === "forbidden") return <CoachAccessDenied />;
  if (childForbidden)
    return (
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Group access required</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your access changed. Group details and assignments are no longer shown.
        </p>
      </section>
    );
  return (
    <OrganizationGroupDetail
      actorProfileId={actorProfileId}
      group={loaded.result.group}
      key={`${organizationId}:${groupId}:${actorProfileId}`}
      organizationId={organizationId}
    >
      <nav aria-label="Organization group management" className="flex flex-wrap gap-3">
        <Link
          to="/organizations/$organizationId/groups/$groupId/coaches"
          params={{ organizationId, groupId }}
          className="text-sm text-cyan-300 hover:text-cyan-200"
        >
          Manage group coaches
        </Link>
        <Link
          to="/organizations/$organizationId/groups/$groupId/athletes"
          params={{ organizationId, groupId }}
          className="text-sm text-cyan-300 hover:text-cyan-200"
        >
          Manage group athletes
        </Link>
      </nav>
      <Outlet />
    </OrganizationGroupDetail>
  );
}
