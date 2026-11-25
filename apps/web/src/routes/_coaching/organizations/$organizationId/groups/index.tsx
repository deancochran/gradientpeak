import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { CoachAccessDenied } from "../../../../../components/coaching/coach-access-denied";
import {
  OrganizationGroupList,
  OrganizationGroupsError,
  OrganizationGroupsPending,
} from "../../../../../components/coaching/organization-groups/organization-group-list";
import { loadOrganizationGroups } from "../../../../../lib/coaching/organization-groups-server-functions";

const groupSearchSchema = z.object({ cursor: z.string().uuid().optional() }).strict();

export const Route = createFileRoute("/_coaching/organizations/$organizationId/groups/")({
  validateSearch: (search) => groupSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ cursor: search.cursor ?? null }),
  loader: async ({ params, deps, context }) => ({
    organizationId: params.organizationId,
    actorProfileId: context.actorProfileId,
    cursor: deps.cursor,
    result: await loadOrganizationGroups({
      data: { organizationId: params.organizationId, limit: 20, cursor: deps.cursor },
    }),
  }),
  pendingMs: 0,
  pendingComponent: OrganizationGroupsPending,
  errorComponent: OrganizationGroupsError,
  component: OrganizationGroupsIndexPage,
});
function OrganizationGroupsIndexPage() {
  const loaded = Route.useLoaderData();
  const { cursor } = Route.useSearch();
  const { organizationId } = Route.useParams();
  const { actorProfileId } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const groupsPath = `/organizations/${organizationId}/groups`;
  if (
    (pathname !== groupsPath && pathname !== `${groupsPath}/`) ||
    loaded.organizationId !== organizationId ||
    loaded.actorProfileId !== actorProfileId ||
    loaded.cursor !== (cursor ?? null)
  )
    return <OrganizationGroupsPending />;
  if (loaded.result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationGroupList
      initialPage={loaded.result}
      key={`${actorProfileId}:${organizationId}:${cursor ?? "first"}`}
      organizationId={organizationId}
    />
  );
}
