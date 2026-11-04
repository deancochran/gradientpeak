import { createFileRoute } from "@tanstack/react-router";
import { InvitationResponse } from "../../components/coaching/invitation-response/invitation-response";

export const Route = createFileRoute("/_protected/organization-invitations")({
  component: OrganizationInvitationsPage,
});
function OrganizationInvitationsPage() {
  const { authUserId } = Route.useRouteContext();
  if (!authUserId) return null;
  return <InvitationResponse actorId={authUserId} />;
}
