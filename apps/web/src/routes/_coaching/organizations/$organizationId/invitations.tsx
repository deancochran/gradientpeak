import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { z } from "zod";

import { CoachAccessDenied } from "../../../../components/coaching/coach-access-denied";
import {
  INVITATION_PAGE_SIZE,
  OrganizationInvitations,
  OrganizationInvitationsError,
  OrganizationInvitationsPending,
} from "../../../../components/coaching/organization-invitations/organization-invitations";
import { loadOrganizationInvitations } from "../../../../lib/coaching/organization-invitations-server-functions";

const invitationSearchSchema = z.object({ cursor: z.string().min(1).max(512).optional() }).strict();

export const Route = createFileRoute("/_coaching/organizations/$organizationId/invitations")({
  validateSearch: (search) => invitationSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ cursor: search.cursor ?? null }),
  loader: async ({ params, deps, context }) => ({
    organizationId: params.organizationId,
    actorProfileId: context.actorProfileId,
    cursor: deps.cursor,
    result: await loadOrganizationInvitations({
      data: {
        organizationId: params.organizationId,
        limit: INVITATION_PAGE_SIZE,
        cursor: deps.cursor,
      },
    }),
  }),
  pendingMs: 0,
  pendingComponent: OrganizationInvitationsPending,
  errorComponent: OrganizationInvitationsError,
  component: InvitationPage,
});

function InvitationPage() {
  const loaded = Route.useLoaderData();
  const { cursor } = Route.useSearch();
  const { organizationId } = Route.useParams();
  const { actorProfileId } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const invitationsPath = `/organizations/${organizationId}/invitations`;
  if (
    (pathname !== invitationsPath && pathname !== `${invitationsPath}/`) ||
    loaded.organizationId !== organizationId ||
    loaded.actorProfileId !== actorProfileId ||
    loaded.cursor !== (cursor ?? null)
  )
    return <OrganizationInvitationsPending />;
  if (loaded.result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationInvitations
      organizationId={organizationId}
      actorProfileId={actorProfileId}
      canInviteAdministrators={loaded.result.canInviteAdministrators}
      page={loaded.result.page}
      {...(cursor === undefined ? {} : { cursor })}
    />
  );
}
