import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { InvitationResponse } from "../../components/coaching/invitation-response/invitation-response";
import { takeOrganizationInvitationHandoffFromWindow } from "../../lib/coaching/invitation-handoff";

export const Route = createFileRoute("/_protected/organization-invitations")({
  component: OrganizationInvitationsPage,
});
function OrganizationInvitationsPage() {
  const { authUserId } = Route.useRouteContext();
  const [initialInvitationToken, setInitialInvitationToken] = useState<string | null>(null);
  const initialActorId = useRef(authUserId);
  const handoffConsumed = useRef(false);
  useEffect(() => {
    if (!authUserId) {
      setInitialInvitationToken(null);
      return;
    }
    if (!initialActorId.current && !handoffConsumed.current) initialActorId.current = authUserId;
    if (initialActorId.current !== authUserId) {
      setInitialInvitationToken(null);
      return;
    }
    if (handoffConsumed.current) return;
    handoffConsumed.current = true;
    setInitialInvitationToken(takeOrganizationInvitationHandoffFromWindow(window));
  }, [authUserId]);
  if (!authUserId) return null;
  return (
    <InvitationResponse
      actorId={authUserId}
      {...(initialInvitationToken && initialActorId.current === authUserId
        ? { initialInvitationToken }
        : {})}
    />
  );
}
