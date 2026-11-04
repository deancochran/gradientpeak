import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  loadAdministrativeAthleteRoster,
  terminateAthleteEngagement,
} from "../../../lib/coaching/athletes-server-functions";
import { OrganizationCoachingAssignments } from "../organization-coaching-assignments/organization-coaching-assignments";

const PAGE_SIZE = 20;
const terminationSchema = z.object({
  reason: z.literal("administrative_termination"),
  confirmed: z.boolean().refine(Boolean, "Confirm that you want to end this engagement."),
});
type TerminationValues = z.infer<typeof terminationSchema>;
type Athlete = {
  engagementId: string;
  identity: { displayName: string | null; username: string | null };
  status: "active" | "paused";
};
type Page = { items: Athlete[]; nextCursor: string | null; hasMore: boolean };
type RosterResult =
  | { status: "granted"; items: Athlete[]; nextCursor: string | null; hasMore: boolean }
  | { status: "forbidden" };

export function AdministrativeAthleteRoster({
  organizationId,
  actorProfileId,
  initialPage,
}: {
  organizationId: string;
  actorProfileId: string;
  initialPage: Page;
}) {
  return (
    <AdministrativeAthleteRosterContents
      key={`${actorProfileId}:${organizationId}`}
      actorProfileId={actorProfileId}
      organizationId={organizationId}
      initialPage={initialPage}
    />
  );
}
function AdministrativeAthleteRosterContents({
  organizationId,
  actorProfileId,
  initialPage,
}: {
  organizationId: string;
  actorProfileId: string;
  initialPage: Page;
}) {
  const loadRoster = useServerFn(loadAdministrativeAthleteRoster);
  const endEngagement = useServerFn(terminateAthleteEngagement);
  const [page, setPage] = useState<Page>(initialPage);
  const [selected, setSelected] = useState<Athlete | null>(null);
  const [managingResponsibilitiesFor, setManagingResponsibilitiesFor] = useState<Athlete | null>(
    null,
  );
  const [accessLost, setAccessLost] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isTerminationPending, setIsTerminationPending] = useState(false);
  const form = useForm<TerminationValues>({
    resolver: zodResolver(terminationSchema),
    defaultValues: { reason: "administrative_termination", confirmed: false },
  });
  const mounted = useRef(true);
  const organization = useRef(organizationId);
  const appliedOrganization = useRef(organizationId);
  const contextVersion = useRef(0);
  const requestVersion = useRef(0);
  const operationRef = useRef<{ fingerprint: string; correlationId: string } | null>(null);
  const pendingSubmission = useRef<string | null>(null);
  const endedEngagementIds = useRef(new Set<string>());
  if (organization.current !== organizationId) {
    organization.current = organizationId;
    contextVersion.current += 1;
    requestVersion.current += 1;
  }
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  useEffect(() => {
    // Route keying normally remounts this component. Direct callers still need tenant isolation,
    // while a fresh loader snapshot must invalidate only in-flight reads, not a pending mutation.
    if (organization.current !== organizationId) return;
    mounted.current = true;
    const tenantChanged = appliedOrganization.current !== organizationId;
    if (tenantChanged) {
      appliedOrganization.current = organizationId;
      endedEngagementIds.current.clear();
    }
    // Every loader snapshot is newer than every page read begun before it. Acknowledged end IDs
    // are merged independently below, so invalidating a refresh cannot restore an ended athlete.
    requestVersion.current += 1;

    // Once an end command is acknowledged, it is durable local knowledge for this tenant. Every
    // same-tenant snapshot is filtered so a stale loader response cannot resurrect that identity.
    setPage(withoutEndedEngagements(initialPage, endedEngagementIds.current));
    setLoadError(null);
    setIsLoadingPage(false);

    if (!tenantChanged) {
      return;
    }

    setSelected(null);
    setManagingResponsibilitiesFor(null);
    setAccessLost(false);
    setSaveNotice(null);
    operationRef.current = null;
    pendingSubmission.current = null;
    setIsTerminationPending(false);
    form.reset();
  }, [form, initialPage, organizationId]);

  function current(context: number, request?: number) {
    return (
      mounted.current &&
      organization.current === organizationId &&
      contextVersion.current === context &&
      (request === undefined || requestVersion.current === request)
    );
  }
  async function load(cursor: string | null) {
    const context = contextVersion.current;
    const request = ++requestVersion.current;
    setLoadError(null);
    setIsLoadingPage(true);
    try {
      const result = (await loadRoster({
        data: { organizationId, limit: PAGE_SIZE, cursor },
      })) as RosterResult;
      if (!current(context, request)) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        return;
      }
      setPage(withoutEndedEngagements(result, endedEngagementIds.current));
    } catch {
      if (!current(context, request)) return;
      setLoadError("The athlete roster could not be refreshed. Your current page is unchanged.");
    } finally {
      if (current(context, request)) setIsLoadingPage(false);
    }
  }

  async function submit(values: TerminationValues) {
    if (managingResponsibilitiesFor) return;
    if (!selected) return;
    const context = contextVersion.current;
    // React state does not update synchronously. This ref is the authoritative single-flight guard
    // for repeated submit events and for selecting another row before the current command settles.
    if (pendingSubmission.current !== null) return;
    // A prior page read must not revive this row after its termination commits.
    requestVersion.current += 1;
    const fingerprint = `${organizationId}:${selected.engagementId}:${values.reason}`;
    const correlationId =
      operationRef.current?.fingerprint === fingerprint
        ? operationRef.current.correlationId
        : crypto.randomUUID();
    const pendingKey = `${context}:${fingerprint}:${correlationId}`;
    pendingSubmission.current = pendingKey;
    setIsTerminationPending(true);
    operationRef.current = { fingerprint, correlationId };
    setSaveNotice(null);
    form.clearErrors("root");
    try {
      const result = await endEngagement({
        data: {
          organizationId,
          engagementId: selected.engagementId,
          reason: values.reason,
          correlationId,
        },
      });
      if (!current(context)) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        return;
      }
      endedEngagementIds.current.add(selected.engagementId);
      setPage((current) => ({
        ...current,
        items: current.items.filter((athlete) => athlete.engagementId !== selected.engagementId),
      }));
      setSelected(null);
      form.reset();
      setSaveNotice(`${identityName(selected)}'s engagement has ended.`);
      // The write is committed before refresh. A refresh failure must not be presented as a failed termination.
      await load(null);
    } catch {
      if (!current(context)) return;
      form.setError("root", {
        message: "The termination was not confirmed. Retry only if the engagement is still active.",
      });
    } finally {
      if (pendingSubmission.current === pendingKey) {
        pendingSubmission.current = null;
        if (current(context)) setIsTerminationPending(false);
      }
    }
  }

  if (accessLost) return <RosterAccessLost />;
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
          Administration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Athlete roster</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Identity and engagement status only. This roster does not provide access to private
          athlete training.
        </p>
      </header>
      {saveNotice ? (
        <p className="text-sm text-emerald-300" role="status">
          {saveNotice}
        </p>
      ) : null}
      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Enrolled athletes</CardTitle>
          <CardDescription className="text-slate-400">
            Paused engagements remain visible. Pause and resume are unavailable here; ending an
            engagement remains subject to server authorization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {page.items.length === 0 ? (
            <p className="text-sm text-slate-400">No athlete engagements are listed.</p>
          ) : (
            <ul aria-label="Athletes" className="space-y-3">
              {page.items.map((athlete) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3"
                  key={athlete.engagementId}
                >
                  <span>
                    <span className="block font-medium">{identityName(athlete)}</span>
                    {athlete.identity.username ? (
                      <span className="text-sm text-slate-400">@{athlete.identity.username}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge className="border-slate-700 bg-slate-800 capitalize text-slate-200">
                      {athlete.status}
                    </Badge>
                    <Button
                      disabled={
                        isTerminationPending ||
                        Boolean(managingResponsibilitiesFor) ||
                        Boolean(selected)
                      }
                      onClick={() => {
                        if (!selected && !managingResponsibilitiesFor && !isTerminationPending)
                          setManagingResponsibilitiesFor(athlete);
                      }}
                      type="button"
                      variant="outline"
                    >
                      Manage coaches
                    </Button>
                    <Button
                      disabled={isTerminationPending || Boolean(managingResponsibilitiesFor)}
                      onClick={() => {
                        if (pendingSubmission.current !== null) return;
                        setSelected(athlete);
                        form.reset();
                        form.clearErrors();
                      }}
                      type="button"
                      variant="destructive"
                    >
                      End engagement
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {page.hasMore ? (
            <Button
              disabled={
                form.formState.isSubmitting ||
                isLoadingPage ||
                isTerminationPending ||
                Boolean(managingResponsibilitiesFor)
              }
              onClick={() => load(page.nextCursor)}
              type="button"
              variant="outline"
            >
              {isLoadingPage ? "Loading athletes…" : "Load more athletes"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
      {managingResponsibilitiesFor ? (
        <OrganizationCoachingAssignments
          athleteName={identityName(managingResponsibilitiesFor)}
          actorProfileId={actorProfileId}
          engagementId={managingResponsibilitiesFor.engagementId}
          onClose={() => setManagingResponsibilitiesFor(null)}
          onAccessLost={() => setAccessLost(true)}
          organizationId={organizationId}
        />
      ) : null}
      {selected && !managingResponsibilitiesFor ? (
        <Card className="border-destructive bg-slate-950 text-slate-50">
          <CardHeader>
            <CardTitle>End engagement with {identityName(selected)}</CardTitle>
            <CardDescription className="text-slate-400">
              This destructive administrative action ends the selected athlete’s engagement. It does
              not grant access to training data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
              <input type="hidden" {...form.register("reason")} />
              <label className="flex items-start gap-2 text-sm">
                <input
                  aria-describedby="termination-confirmation"
                  type="checkbox"
                  {...form.register("confirmed")}
                />
                <span id="termination-confirmation">
                  I understand that ending {identityName(selected)}’s engagement is destructive.
                </span>
              </label>
              {form.formState.errors.confirmed ? (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.confirmed.message}
                </p>
              ) : null}
              {form.formState.errors.root ? (
                <p className="text-sm text-destructive" role="alert">
                  {form.formState.errors.root.message}
                </p>
              ) : null}
              <div className="flex gap-3">
                <Button
                  disabled={form.formState.isSubmitting || isTerminationPending}
                  type="submit"
                  variant="destructive"
                >
                  {form.formState.isSubmitting ? "Ending engagement…" : "Confirm end engagement"}
                </Button>
                <Button
                  disabled={form.formState.isSubmitting || isTerminationPending}
                  onClick={() => {
                    setSelected(null);
                    form.reset();
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function RosterAccessLost() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-white">Coaching access required</h1>
      <p className="mt-2 text-sm text-slate-400">
        Your access to this organization changed. Athlete information is no longer shown.
      </p>
    </div>
  );
}
function identityName(athlete: Athlete) {
  return athlete.identity.displayName ?? athlete.identity.username ?? "Organization member";
}

function withoutEndedEngagements(page: Page, endedEngagementIds: ReadonlySet<string>): Page {
  // Kept outside the component to make the page merge explicit and avoid a second source of roster truth.
  return {
    ...page,
    items: page.items.filter((athlete) => !endedEngagementIds.has(athlete.engagementId)),
  };
}
