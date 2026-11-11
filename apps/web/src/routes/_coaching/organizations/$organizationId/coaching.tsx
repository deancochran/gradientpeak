import { createFileRoute, useRouterState } from "@tanstack/react-router";
import {
  OrganizationCoachingQuality,
  OrganizationCoachingQualityDenied,
  OrganizationCoachingQualityError,
  OrganizationCoachingQualityPending,
} from "../../../../components/coaching/organization-coaching-quality/organization-coaching-quality";
import { loadOrganizationCoachingQuality } from "../../../../lib/coaching/organization-coaching-quality-server-functions";

export const Route = createFileRoute("/_coaching/organizations/$organizationId/coaching")({
  loader: async ({ params, context }) => ({
    organizationId: params.organizationId,
    actorProfileId: context.actorProfileId,
    result: await loadOrganizationCoachingQuality({
      data: { organizationId: params.organizationId },
    }),
  }),
  pendingMs: 0,
  pendingComponent: CoachingPending,
  errorComponent: CoachingError,
  component: CoachingPage,
});
function CoachingPage() {
  const loaded = Route.useLoaderData();
  const { organizationId } = Route.useParams();
  const { actorProfileId } = Route.useRouteContext();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const expected = `/organizations/${organizationId}/coaching`;
  if (
    (pathname !== expected && pathname !== `${expected}/`) ||
    loaded.organizationId !== organizationId ||
    loaded.actorProfileId !== actorProfileId
  )
    return <OrganizationCoachingQualityPending organizationId={organizationId} />;
  if (loaded.result.status === "forbidden") return <OrganizationCoachingQualityDenied />;
  return (
    <OrganizationCoachingQuality
      organizationId={organizationId}
      overview={loaded.result.overview}
    />
  );
}
function CoachingPending() {
  return <OrganizationCoachingQualityPending organizationId={Route.useParams().organizationId} />;
}
function CoachingError() {
  return <OrganizationCoachingQualityError organizationId={Route.useParams().organizationId} />;
}
