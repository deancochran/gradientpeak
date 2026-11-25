import type { ActivityPlanSummary } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Label } from "@repo/ui/components/label";
import {
  ResourceAssociation,
  ResourceSelectionField,
} from "@repo/ui/components/resource-presentation";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { api } from "../../../lib/api/client";
import {
  type ActivityPlanPreparationSearch,
  activityPlanPreparationSearch,
  parseActivityPlanPreparationContext,
  parseAthleteWorkspaceSearch,
} from "../../../lib/coaching/activity-plan-preparation-context";
import { ActivityPlanCard } from "../../activity-plan/activity-plan-card";

type PublicationInput = {
  activityPlanId: string;
  activityPlanRevision: number;
  athleteProfileId: string;
  coachMembershipId: string;
  organizationId: string;
  planningDate: string;
};

function inputKey(input: PublicationInput) {
  return [
    input.organizationId,
    input.athleteProfileId,
    input.coachMembershipId,
    input.activityPlanId,
    input.activityPlanRevision,
    input.planningDate,
  ].join(":");
}

function errorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "We could not complete this request. Your draft is still here.";
}

/**
 * Publishes one immutable owned activity-plan revision to an assigned athlete's local planning date.
 * Authorization, revision checks, and idempotency remain authoritative at the API boundary.
 */
export function CoachActivityPlanPublication({
  athleteId,
  calendarStartDate,
  organizationId,
  preparation = null,
}: {
  athleteId: string;
  calendarStartDate?: string;
  organizationId: string;
  preparation?: ActivityPlanPreparationSearch | null;
}) {
  const navigate = useNavigate();
  const liveCalendarStartDate = useRouterState({
    select: (state) =>
      typeof state.location.search.calendarStartDate === "string"
        ? state.location.search.calendarStartDate
        : undefined,
  });
  const liveWorkspaceSearch = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>,
  });
  const organizations = api.organizations.listMine.useQuery({ cursor: null, limit: 50 });
  const activityPlans = api.activityPlans.list.useQuery({ limit: 50, ownerScope: "own" });
  const publish = api.coachingPublication.publish.useMutation({ retry: false });
  const coachMembership = organizations.data?.items.find(
    (item) =>
      item.organization.organizationId === organizationId &&
      item.membership.roles.includes("coach"),
  )?.membership.membershipId;
  const plans = activityPlans.data?.items ?? [];
  const [activityPlanId, setActivityPlanId] = useState(preparation?.activityPlanId ?? "");
  const [planningDate, setPlanningDate] = useState(preparation?.planningDate ?? "");
  const [previewed, setPreviewed] = useState<{
    key: string;
    data: {
      athleteTimezone: string;
      versionMatches: boolean;
      activityPlan: { name: string; revision: number };
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const operationId = useRef(crypto.randomUUID());
  const previewGeneration = useRef(0);
  // The library list is intentionally paginated. Resolve the selected id independently so a
  // prepared plan beyond its first page can still be published, while canEdit keeps this flow
  // restricted to the coach's own plan.
  const selectedPlanQuery = api.activityPlans.getById.useQuery(
    { id: activityPlanId || "00000000-0000-4000-8000-000000000000", personalize: false },
    { enabled: Boolean(activityPlanId), retry: false },
  );
  const selectedPlanDetail = selectedPlanQuery.data?.detail;
  const selectedPlanCard: ActivityPlanSummary | null =
    selectedPlanDetail?.id === activityPlanId &&
    selectedPlanDetail.capabilities.canEdit &&
    !selectedPlanQuery.isError &&
    !selectedPlanQuery.isLoading &&
    selectedPlanDetail.structure
      ? {
          ...selectedPlanDetail,
          contractVersion: "activity-plan-summary-v1",
        }
      : null;
  const selectedPlan =
    selectedPlanDetail?.id === activityPlanId && selectedPlanDetail.capabilities.canEdit
      ? {
          activityPlanRevision: selectedPlanDetail.activityPlanRevision,
          id: selectedPlanDetail.id,
          name: selectedPlanDetail.name,
        }
      : null;
  const input =
    selectedPlan && coachMembership && planningDate
      ? {
          activityPlanId: selectedPlan.id,
          activityPlanRevision: selectedPlan.activityPlanRevision,
          athleteProfileId: athleteId,
          coachMembershipId: coachMembership,
          organizationId,
          planningDate,
        }
      : null;
  const key = input ? inputKey(input) : null;
  // Query input changes with every publishing field. It stays disabled until the coach explicitly
  // requests a preview, so a refetch can never use a prior activity-plan/date tuple.
  const preview = api.coachingPublication.preview.useQuery(
    input ?? {
      activityPlanId: "00000000-0000-4000-8000-000000000000",
      activityPlanRevision: 1,
      athleteProfileId: athleteId,
      coachMembershipId: "00000000-0000-4000-8000-000000000000",
      organizationId,
      planningDate: "2000-01-01",
    },
    { enabled: false, retry: false },
  );

  function invalidatePreviewIntent() {
    previewGeneration.current += 1;
    setPreviewed(null);
    setError(null);
    setSuccess(null);
    operationId.current = crypto.randomUUID();
  }

  // A week transition updates the router location before its loader settles.
  // Use that live URL anchor for both the next replacement and the outbound
  // library link; the loader-owned prop may still describe the previous week.
  const currentCalendarStartDate = liveCalendarStartDate ?? calendarStartDate;
  // The workspace can remain mounted when a coach changes dates. Always derive outbound
  // preparation from the current form state rather than reusing the arrival URL's old date.
  const preparationContext = parseActivityPlanPreparationContext({
    athleteId,
    ...(currentCalendarStartDate ? { calendarStartDate: currentCalendarStartDate } : {}),
    organizationId,
    planningDate,
    returnTo: "athlete-workspace",
  });
  const selectedPlanHref =
    selectedPlanCard && preparationContext && !publish.isPending
      ? `/activity-plans/${selectedPlanCard.id}?${new URLSearchParams(
          activityPlanPreparationSearch(preparationContext, selectedPlanCard.id),
        ).toString()}`
      : undefined;

  function retainWorkspaceContext(next: { activityPlanId?: string; planningDate: string }) {
    const nextContext = parseActivityPlanPreparationContext({
      athleteId,
      ...(currentCalendarStartDate ? { calendarStartDate: currentCalendarStartDate } : {}),
      organizationId,
      planningDate: next.planningDate,
      returnTo: "athlete-workspace",
    });
    // A date control can temporarily be blank while the coach corrects it.
    // Keep that in-memory draft and the last valid return URL intact.
    if (!nextContext) return;
    const current = parseAthleteWorkspaceSearch(liveWorkspaceSearch);
    const nextSearch = activityPlanPreparationSearch(nextContext, next.activityPlanId);
    if (
      current.activityPlanId === nextSearch.activityPlanId &&
      current.athleteId === nextSearch.athleteId &&
      current.calendarStartDate === nextSearch.calendarStartDate &&
      current.organizationId === nextSearch.organizationId &&
      current.planningDate === nextSearch.planningDate &&
      current.returnTo === nextSearch.returnTo
    )
      return;
    void navigate({
      to: "/organizations/$organizationId/athletes/$athleteId",
      params: { athleteId, organizationId },
      search: ((previous: Record<string, unknown>) => {
        const {
          activityPlanId: _priorActivityPlanId,
          athleteId: _priorAthleteId,
          calendarStartDate: _priorCalendarStartDate,
          organizationId: _priorOrganizationId,
          planningDate: _priorPlanningDate,
          returnTo: _priorReturnTo,
          ...otherSearch
        } = previous;
        const latest = parseAthleteWorkspaceSearch(previous);
        const context = parseActivityPlanPreparationContext({
          athleteId,
          ...((latest.calendarStartDate ?? currentCalendarStartDate)
            ? { calendarStartDate: latest.calendarStartDate ?? currentCalendarStartDate }
            : {}),
          organizationId,
          planningDate: next.planningDate,
          returnTo: "athlete-workspace",
        });
        // nextContext proves this date is valid. Keep the fallback fail-closed
        // in case a future caller changes the callback's previous search shape.
        if (!context) return otherSearch;
        return {
          ...otherSearch,
          ...activityPlanPreparationSearch(context, next.activityPlanId),
        };
      }) as never,
      replace: true,
    } as never);
  }

  async function requestPreview() {
    if (!input || !key) return;
    const requestGeneration = previewGeneration.current;
    const requestKey = key;
    setError(null);
    setSuccess(null);
    try {
      const result = await preview.refetch({ throwOnError: true });
      if (!result.data || previewGeneration.current !== requestGeneration || key !== requestKey)
        return;
      setPreviewed({ key: requestKey, data: result.data });
    } catch (caught) {
      if (previewGeneration.current !== requestGeneration) return;
      setPreviewed(null);
      setError(errorMessage(caught));
    }
  }

  async function publishActivityPlan() {
    if (!input || !previewed || previewed.key !== key || !previewed.data.versionMatches) return;
    setError(null);
    setSuccess(null);
    try {
      await publish.mutateAsync({ ...input, operationId: operationId.current });
      setSuccess(`Published ${previewed.data.activityPlan.name} for ${input.planningDate}.`);
    } catch (caught) {
      // Retain this exact operation ID. A network interruption has an unknown outcome and retry is safe.
      setError(
        `${errorMessage(caught)} Retry publishes this exact request; do not change the activity plan or date until it is resolved.`,
      );
    }
  }

  async function refreshSelectedPlan() {
    if (!activityPlanId) return;
    invalidatePreviewIntent();
    try {
      await selectedPlanQuery.refetch({ throwOnError: true });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <Card className="border-primary/30 bg-background text-foreground shadow-[0_0_0_1px_rgba(34,211,238,0.04)]">
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl tracking-tight">Publish an activity plan</CardTitle>
        <CardDescription className="text-muted-foreground">
          Choose one of your activity plans and the athlete’s local planning date. Publishing
          creates a planned session; it does not promise delivery to a connected provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preparationContext && !publish.isPending ? (
          <Button
            asChild
            className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground"
            type="button"
            variant="outline"
          >
            <Link
              to="/activity-plans"
              search={
                activityPlanPreparationSearch(
                  preparationContext,
                  activityPlanId || undefined,
                ) as never
              }
            >
              Prepare activity plan
            </Link>
          </Button>
        ) : (
          <Button
            className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground"
            disabled
            type="button"
            variant="outline"
          >
            Prepare activity plan
          </Button>
        )}
        {!preparationContext ? (
          <p className="text-sm text-muted-foreground">
            Choose a real athlete planning date before preparing an activity plan.
          </p>
        ) : null}
        {preparation ? (
          <p className="text-sm text-primary">
            Preparing a coach-owned draft for {planningDate}. A fresh publication preview is still
            required before it becomes visible to the athlete.
          </p>
        ) : null}
        {organizations.isLoading || activityPlans.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading your activity-plan library…
          </p>
        ) : null}
        {organizations.error || activityPlans.error ? (
          <p role="alert" className="text-sm text-destructive">
            Your publishing options could not be loaded. Refresh the page and try again.
          </p>
        ) : null}
        {!organizations.isLoading && !coachMembership ? (
          <p role="alert" className="text-sm text-warning">
            Your active coach membership for this organization is unavailable. No activity plan can
            be published from this workspace.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <ResourceSelectionField
              automaticLabel="Choose an activity plan"
              disabled={!coachMembership || publish.isPending}
              fallbackLabel={
                selectedPlan
                  ? `${selectedPlan.name} · version ${selectedPlan.activityPlanRevision}`
                  : "Selected activity plan"
              }
              id="coach-activity-plan"
              label="Your activity plan"
              onChange={(nextActivityPlanId) => {
                invalidatePreviewIntent();
                const nextId = nextActivityPlanId ?? "";
                setActivityPlanId(nextId);
                retainWorkspaceContext({ activityPlanId: nextId, planningDate });
              }}
              options={plans.map((plan) => ({
                label: `${plan.name} · version ${plan.activityPlanRevision}`,
                value: plan.id,
              }))}
              value={activityPlanId || null}
            />
            {!activityPlans.isLoading && plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Create an activity plan in your library first.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="coach-planning-date">Athlete planning date</Label>
            <input
              className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={!coachMembership || publish.isPending}
              id="coach-planning-date"
              onChange={(event) => {
                invalidatePreviewIntent();
                const nextPlanningDate = event.target.value;
                setPlanningDate(nextPlanningDate);
                retainWorkspaceContext({ activityPlanId, planningDate: nextPlanningDate });
              }}
              type="date"
              value={planningDate}
            />
          </div>
        </div>
        {activityPlanId && selectedPlanQuery.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading selected activity plan…
          </p>
        ) : null}
        {activityPlanId && selectedPlanQuery.isError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">
              The selected activity plan could not be loaded. Your selection has not been changed.
            </p>
            <Button
              className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground"
              onClick={() => void refreshSelectedPlan()}
              size="sm"
              type="button"
              variant="outline"
            >
              Retry selected activity plan
            </Button>
          </div>
        ) : null}
        {activityPlanId &&
        !selectedPlanQuery.isLoading &&
        !selectedPlanQuery.isError &&
        !selectedPlan ? (
          <p role="alert" className="text-sm text-warning">
            {selectedPlanDetail
              ? "The selected activity plan is not editable in your owned library."
              : "The selected activity plan is no longer available."}
          </p>
        ) : null}
        {selectedPlanCard ? (
          <ResourceAssociation
            description={
              selectedPlanHref
                ? "Inspect or edit this plan before publishing. Your athlete, planning date, and selected week stay attached to the return link."
                : publish.isPending
                  ? "Plan inspection is unavailable while publication is pending."
                  : "Choose a real athlete planning date before inspecting or editing this plan."
            }
            label="Selected activity plan"
            testID="coach-selected-activity-plan"
          >
            <ActivityPlanCard
              disabled={!selectedPlanHref}
              openLabel={`Inspect or edit selected activity plan ${selectedPlanCard.name}`}
              plan={selectedPlanCard}
              {...(selectedPlanHref ? { href: selectedPlanHref } : { onOpen: () => {} })}
            />
          </ResourceAssociation>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" className="text-sm text-success">
            {success}
          </p>
        ) : null}
        {previewed?.key === key ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-medium">Ready to publish: {previewed.data.activityPlan.name}</p>
            <p className="mt-1 text-muted-foreground">
              {input?.planningDate} in the athlete’s {previewed.data.athleteTimezone} planning time
              zone.
            </p>
            {!previewed.data.versionMatches ? (
              <div className="mt-2 space-y-2">
                <p role="alert" className="text-warning">
                  This activity plan changed since it was selected. Refresh the current revision,
                  then preview it again before publishing.
                </p>
                <Button
                  className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground"
                  disabled={selectedPlanQuery.isFetching}
                  onClick={() => void refreshSelectedPlan()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {selectedPlanQuery.isFetching
                    ? "Refreshing activity plan…"
                    : "Refresh activity plan"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground"
            disabled={!input || preview.isFetching || publish.isPending}
            onClick={() => void requestPreview()}
            type="button"
            variant="outline"
          >
            {preview.isFetching ? "Checking publication…" : "Preview publication"}
          </Button>
          <Button
            className="bg-primary font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring disabled:bg-muted disabled:text-muted-foreground"
            disabled={
              !input ||
              !previewed ||
              previewed.key !== key ||
              !previewed.data.versionMatches ||
              publish.isPending
            }
            onClick={() => void publishActivityPlan()}
            type="button"
          >
            {publish.isPending ? "Publishing…" : "Publish activity plan"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
