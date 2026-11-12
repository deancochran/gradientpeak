import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Label } from "@repo/ui/components/label";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api/client";
import {
  type ActivityPlanPreparationSearch,
  activityPlanPreparationSearch,
  parseActivityPlanPreparationContext,
} from "../../../lib/coaching/activity-plan-preparation-context";

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
  organizationId,
  preparation = null,
}: {
  athleteId: string;
  organizationId: string;
  preparation?: ActivityPlanPreparationSearch | null;
}) {
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

  // The library list is intentionally paginated. Resolve the selected id independently so a
  // prepared plan beyond its first page can still be published, while canEdit keeps this flow
  // restricted to the coach's own plan.
  const selectedPlanQuery = api.activityPlans.getById.useQuery(
    { id: activityPlanId || "00000000-0000-4000-8000-000000000000", personalize: false },
    { enabled: Boolean(activityPlanId), retry: false },
  );
  const selectedPlanDetail = selectedPlanQuery.data?.detail;
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

  // A changed date or activity plan is a new intent: discard its old preview and make a fresh idempotency key.
  useEffect(() => {
    void key;
    setPreviewed(null);
    setError(null);
    setSuccess(null);
    operationId.current = crypto.randomUUID();
  }, [key]);

  // The workspace can remain mounted when a coach changes dates. Always derive outbound
  // preparation from the current form state rather than reusing the arrival URL's old date.
  const preparationContext = parseActivityPlanPreparationContext({
    athleteId,
    organizationId,
    planningDate,
    returnTo: "athlete-workspace",
  });
  const selectedPlanIsInLibrary = plans.some((plan) => plan.id === selectedPlan?.id);

  async function requestPreview() {
    if (!input) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await preview.refetch({ throwOnError: true });
      if (!result.data || key !== inputKey(input)) return;
      setPreviewed({ key, data: result.data });
    } catch (caught) {
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
    setError(null);
    setPreviewed(null);
    setSuccess(null);
    try {
      await selectedPlanQuery.refetch({ throwOnError: true });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <Card className="border-cyan-900 bg-slate-950 text-slate-50">
      <CardHeader>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">Plan</p>
        <CardTitle>Publish an activity plan</CardTitle>
        <CardDescription className="text-slate-400">
          Choose one of your activity plans and the athlete’s local planning date. Publishing
          creates a planned session; it does not promise delivery to a connected provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button asChild disabled={!preparationContext} type="button" variant="outline">
          <Link
            to="/activity-plans"
            search={
              preparationContext
                ? (activityPlanPreparationSearch(
                    preparationContext,
                    activityPlanId || undefined,
                  ) as never)
                : { activity_category: undefined, q: undefined }
            }
          >
            Prepare activity plan
          </Link>
        </Button>
        {!preparationContext ? (
          <p className="text-sm text-slate-400">
            Choose a real athlete planning date before preparing an activity plan.
          </p>
        ) : null}
        {preparation ? (
          <p className="text-sm text-cyan-100">
            Preparing a coach-owned draft for {planningDate}. A fresh publication preview is still
            required before it becomes visible to the athlete.
          </p>
        ) : null}
        {organizations.isLoading || activityPlans.isLoading ? (
          <p role="status" className="text-sm text-slate-400">
            Loading your activity-plan library…
          </p>
        ) : null}
        {organizations.error || activityPlans.error ? (
          <p role="alert" className="text-sm text-red-300">
            Your publishing options could not be loaded. Refresh the page and try again.
          </p>
        ) : null}
        {!organizations.isLoading && !coachMembership ? (
          <p role="alert" className="text-sm text-amber-200">
            Your active coach membership for this organization is unavailable. No activity plan can
            be published from this workspace.
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="coach-activity-plan">Your activity plan</Label>
            <select
              className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
              disabled={!coachMembership || publish.isPending}
              id="coach-activity-plan"
              onChange={(event) => setActivityPlanId(event.target.value)}
              value={activityPlanId}
            >
              <option value="">Choose an activity plan</option>
              {selectedPlan && !selectedPlanIsInLibrary ? (
                <option value={selectedPlan.id}>
                  {selectedPlan.name} · version {selectedPlan.activityPlanRevision}
                </option>
              ) : null}
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} · version {plan.activityPlanRevision}
                </option>
              ))}
            </select>
            {!activityPlans.isLoading && plans.length === 0 ? (
              <p className="text-sm text-slate-400">
                Create an activity plan in your library first.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="coach-planning-date">Athlete planning date</Label>
            <input
              className="min-h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
              disabled={!coachMembership || publish.isPending}
              id="coach-planning-date"
              onChange={(event) => setPlanningDate(event.target.value)}
              type="date"
              value={planningDate}
            />
          </div>
        </div>
        {activityPlanId && selectedPlanQuery.isLoading ? (
          <p role="status" className="text-sm text-slate-400">
            Loading selected activity plan…
          </p>
        ) : null}
        {activityPlanId && selectedPlanQuery.isError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-300">
              The selected activity plan could not be loaded. Your selection has not been changed.
            </p>
            <Button
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
          <p role="alert" className="text-sm text-amber-200">
            {selectedPlanDetail
              ? "The selected activity plan is not editable in your owned library."
              : "The selected activity plan is no longer available."}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" className="text-sm text-emerald-300">
            {success}
          </p>
        ) : null}
        {previewed?.key === key ? (
          <div className="rounded-md border border-cyan-800 bg-cyan-950/40 p-3 text-sm">
            <p className="font-medium">Ready to publish: {previewed.data.activityPlan.name}</p>
            <p className="mt-1 text-slate-300">
              {input?.planningDate} in the athlete’s {previewed.data.athleteTimezone} planning time
              zone.
            </p>
            {!previewed.data.versionMatches ? (
              <div className="mt-2 space-y-2">
                <p role="alert" className="text-amber-200">
                  This activity plan changed since it was selected. Refresh the current revision,
                  then preview it again before publishing.
                </p>
                <Button
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
            disabled={!input || preview.isFetching || publish.isPending}
            onClick={() => void requestPreview()}
            type="button"
            variant="outline"
          >
            {preview.isFetching ? "Checking publication…" : "Preview publication"}
          </Button>
          <Button
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
