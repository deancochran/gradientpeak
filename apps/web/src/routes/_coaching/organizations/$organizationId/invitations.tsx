import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CoachAccessDenied } from "../../../../components/coaching/coach-access-denied";
import {
  INVITATION_PAGE_SIZE,
  OrganizationInvitations,
} from "../../../../components/coaching/organization-invitations/organization-invitations";
import { loadOrganizationInvitations } from "../../../../lib/coaching/organization-invitations-server-functions";

const invitationSearchSchema = z.object({ cursor: z.string().min(1).max(512).optional() }).strict();

export const Route = createFileRoute("/_coaching/organizations/$organizationId/invitations")({
  validateSearch: (search) => invitationSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ cursor: search.cursor ?? null }),
  loader: ({ params, deps }) =>
    loadOrganizationInvitations({
      data: {
        organizationId: params.organizationId,
        limit: INVITATION_PAGE_SIZE,
        cursor: deps.cursor,
      },
    }),
  component: InvitationPage,
});

function InvitationPage() {
  const result = Route.useLoaderData();
  const { cursor } = Route.useSearch();
  const { organizationId } = Route.useParams();
  const { actorProfileId } = Route.useRouteContext();
  if (result.status === "forbidden") return <CoachAccessDenied />;
  return (
    <OrganizationInvitations
      organizationId={organizationId}
      actorProfileId={actorProfileId}
      canInviteAdministrators={result.canInviteAdministrators}
      page={result.page}
      {...(cursor === undefined ? {} : { cursor })}
    />
  );
}
