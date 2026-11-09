import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  assignOrganizationGroupCoach,
  loadOrganizationGroupCoachCandidates,
  loadOrganizationGroupCoachLinks,
  removeOrganizationGroupCoach,
} from "../../../lib/coaching/organization-group-coaches-server-functions";
import { useOrganizationGroupAccessLoss } from "../organization-groups/organization-group-access";

export type CoachLink = { id: string; membershipId: string };
export type CoachCandidate = { membershipId: string; label: string };
type Page<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };

function mergeBy<T>(current: T[], incoming: T[], key: (item: T) => string) {
  const result = new Map(current.map((item) => [key(item), item]));
  for (const item of incoming) result.set(key(item), item);
  return [...result.values()];
}

export function OrganizationGroupCoaches({
  organizationId,
  groupId,
  linkPage,
  candidatePage,
}: {
  organizationId: string;
  groupId: string;
  linkPage: Page<CoachLink>;
  candidatePage: Page<CoachCandidate>;
}) {
  return (
    <OrganizationGroupCoachesContents
      key={`${organizationId}:${groupId}`}
      candidatePage={candidatePage}
      groupId={groupId}
      linkPage={linkPage}
      organizationId={organizationId}
    />
  );
}

function OrganizationGroupCoachesContents({
  organizationId,
  groupId,
  linkPage: initialLinkPage,
  candidatePage: initialCandidatePage,
}: {
  organizationId: string;
  groupId: string;
  linkPage: Page<CoachLink>;
  candidatePage: Page<CoachCandidate>;
}) {
  const router = useRouter();
  const accessLoss = useOrganizationGroupAccessLoss();
  const assignCoach = useServerFn(assignOrganizationGroupCoach);
  const removeCoach = useServerFn(removeOrganizationGroupCoach);
  const loadLinks = useServerFn(loadOrganizationGroupCoachLinks);
  const loadCandidates = useServerFn(loadOrganizationGroupCoachCandidates);
  const mounted = useRef(true);
  const mutationInFlight = useRef(false);
  const linkRequest = useRef(0);
  const candidateRequest = useRef(0);
  const committedAssignmentReceipt = useRef<CoachLink | null>(null);
  const removedLinkIds = useRef(new Set<string>());
  const postCommitLinkRead = useRef(false);
  const uncertainAssign = useRef<{ linkId: string; membershipId: string } | null>(null);
  const [links, setLinks] = useState(initialLinkPage.items);
  const [linkPage, setLinkPage] = useState(initialLinkPage);
  const [candidates, setCandidates] = useState(initialCandidatePage.items);
  const [candidatePage, setCandidatePage] = useState(initialCandidatePage);
  const [membershipId, setMembershipId] = useState("");
  const [removing, setRemoving] = useState<CoachLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const [mutationPending, setMutationPending] = useState(false);
  const [linksPending, setLinksPending] = useState(false);
  const [candidatesPending, setCandidatesPending] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      linkRequest.current += 1;
      candidateRequest.current += 1;
    };
  }, []);
  useEffect(() => {
    // Route loader values carry no freshness marker. Once a direct post-commit
    // read succeeds, retain that known page instead of accepting a late snapshot.
    if (postCommitLinkRead.current) return;
    // Keep locally acknowledged writes through stale or out-of-order loader updates.
    const loaded = initialLinkPage.items.filter((link) => !removedLinkIds.current.has(link.id));
    const committed = committedAssignmentReceipt.current;
    setLinks((current) =>
      mergeBy(
        mergeBy(
          loaded,
          committed && !removedLinkIds.current.has(committed.id) ? [committed] : [],
          (link) => link.id,
        ),
        current,
        (link) => link.id,
      ).filter(
        (link, index, all) =>
          all.findIndex((other) => other.membershipId === link.membershipId) === index,
      ),
    );
    // The keyed identity remount owns resets. A late first-page refresh must not
    // rewind a locally reached cursor and re-request already merged pages.
  }, [initialLinkPage]);
  useEffect(() => {
    setCandidates((current) =>
      mergeBy(current, initialCandidatePage.items, (candidate) => candidate.membershipId),
    );
    // Keep the locally reached candidate cursor for the same reason as links.
  }, [initialCandidatePage]);

  const candidateByMembership = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.membershipId, candidate.label])),
    [candidates],
  );
  const assignedMemberships = new Set(links.map((link) => link.membershipId));
  const receiptMembershipId = committedAssignmentReceipt.current?.membershipId;
  const availableCandidates = candidates.filter(
    (candidate) =>
      !assignedMemberships.has(candidate.membershipId) &&
      candidate.membershipId !== receiptMembershipId,
  );
  const commandBusy = mutationPending || mutationInFlight.current;
  const assignmentBlocked = commandBusy || committedAssignmentReceipt.current !== null;

  async function refreshAfterCommit(message: string) {
    setNotice(message);
    try {
      await router.invalidate();
      await reconcileCommittedLinks();
    } catch {
      if (mounted.current) {
        setLocked(true);
        setNotice(
          `${message} The assignments could not refresh. Refresh the page before another change.`,
        );
      }
    }
  }

  async function reconcileCommittedLinks() {
    const request = ++linkRequest.current;
    const result = await loadLinks({ data: { organizationId, groupId, limit: 20, cursor: null } });
    if (!mounted.current || request !== linkRequest.current) return;
    if (result.status === "forbidden") {
      setAccessLost(true);
      if (accessLoss) accessLoss.reportAccessLost(accessLoss.scope);
      return;
    }
    const confirmed = new Set(result.page.items.map((link) => link.id));
    const receipt = committedAssignmentReceipt.current;
    if (receipt && (confirmed.has(receipt.id) || !result.page.hasMore))
      committedAssignmentReceipt.current = null;
    postCommitLinkRead.current = true;
    // This direct page is authoritative only for page one. Replacing the
    // accumulated view prevents an older snapshot from retaining a temporary
    // row; later active rows stay reachable through the existing cursor.
    setLinks(result.page.items.filter((link) => !removedLinkIds.current.has(link.id)));
    setLinkPage(result.page);
  }

  async function loadMoreLinks() {
    if (linksPending || !linkPage.hasMore || !linkPage.nextCursor) return;
    const request = ++linkRequest.current;
    setLinksPending(true);
    try {
      const result = await loadLinks({
        data: { organizationId, groupId, limit: 20, cursor: linkPage.nextCursor },
      });
      if (!mounted.current || request !== linkRequest.current) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        if (accessLoss) accessLoss.reportAccessLost(accessLoss.scope);
        return;
      }
      const loaded = result.page.items.filter((link) => !removedLinkIds.current.has(link.id));
      const receipt = committedAssignmentReceipt.current;
      if (receipt && result.page.items.some((link) => link.id === receipt.id))
        committedAssignmentReceipt.current = null;
      setLinks((current) =>
        mergeBy(current, loaded, (link) => link.id).filter(
          (link, index, all) =>
            all.findIndex((other) => other.membershipId === link.membershipId) === index,
        ),
      );
      setLinkPage(result.page);
    } catch {
      if (mounted.current && request === linkRequest.current)
        setError("More assigned coaches could not be loaded. Retry this page.");
    } finally {
      if (mounted.current && request === linkRequest.current) setLinksPending(false);
    }
  }

  async function refreshAssignments() {
    if (linksPending) return;
    setLinksPending(true);
    try {
      await reconcileCommittedLinks();
    } catch {
      if (mounted.current) setError("Assignments could not refresh. Retry this page.");
    } finally {
      if (mounted.current) setLinksPending(false);
    }
  }

  async function loadMoreCandidates() {
    if (candidatesPending || !candidatePage.hasMore || !candidatePage.nextCursor) return;
    const request = ++candidateRequest.current;
    setCandidatesPending(true);
    try {
      const result = await loadCandidates({
        data: { organizationId, groupId, limit: 20, cursor: candidatePage.nextCursor },
      });
      if (!mounted.current || request !== candidateRequest.current) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        if (accessLoss) accessLoss.reportAccessLost(accessLoss.scope);
        return;
      }
      setCandidates((current) =>
        mergeBy(current, result.page.items, (candidate) => candidate.membershipId),
      );
      setCandidatePage(result.page);
    } catch {
      if (mounted.current && request === candidateRequest.current)
        setError("More coach candidates could not be loaded. Retry this page.");
    } finally {
      if (mounted.current && request === candidateRequest.current) setCandidatesPending(false);
    }
  }

  async function assign() {
    if (locked || assignmentBlocked) return;
    const previous = uncertainAssign.current;
    const selectedMembershipId = previous?.membershipId ?? membershipId;
    if (!selectedMembershipId) return setError("Choose an active coach to assign.");
    if (previous && previous.membershipId !== membershipId)
      return setError("Retry the same coach assignment or refresh before choosing another coach.");
    const command = {
      organizationId,
      groupId,
      membershipId: selectedMembershipId,
      linkId: previous?.linkId ?? crypto.randomUUID(),
    };
    // Supersede every pre-command resource read before durable state can change.
    linkRequest.current += 1;
    candidateRequest.current += 1;
    mutationInFlight.current = true;
    setMutationPending(true);
    setError(null);
    try {
      const result = await assignCoach({ data: command });
      if (!mounted.current) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        if (accessLoss) accessLoss.reportAccessLost(accessLoss.scope);
        return;
      }
      const added = { id: result.id, membershipId: command.membershipId };
      committedAssignmentReceipt.current = added;
      uncertainAssign.current = null;
      setMembershipId("");
      await refreshAfterCommit("Coach assigned.");
    } catch {
      if (mounted.current) {
        uncertainAssign.current = { linkId: command.linkId, membershipId: command.membershipId };
        setMembershipId(command.membershipId);
        setError(
          "We could not confirm the assignment. Retry the same coach; do not choose another.",
        );
      }
    } finally {
      mutationInFlight.current = false;
      if (mounted.current) setMutationPending(false);
    }
  }

  async function remove() {
    if (!removing || locked || commandBusy) return;
    const command = { organizationId, groupId, linkId: removing.id };
    // Supersede every pre-command resource read before durable state can change.
    linkRequest.current += 1;
    candidateRequest.current += 1;
    mutationInFlight.current = true;
    setMutationPending(true);
    setError(null);
    try {
      const result = await removeCoach({ data: command });
      if (!mounted.current) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        if (accessLoss) accessLoss.reportAccessLost(accessLoss.scope);
        return;
      }
      removedLinkIds.current.add(command.linkId);
      if (committedAssignmentReceipt.current?.id === command.linkId)
        committedAssignmentReceipt.current = null;
      setLinks((current) => current.filter((link) => link.id !== command.linkId));
      setRemoving(null);
      await refreshAfterCommit("Coach removed.");
    } catch {
      if (mounted.current)
        setError(
          "We could not confirm whether the coach was removed. Retry only after checking the assignment.",
        );
    } finally {
      mutationInFlight.current = false;
      if (mounted.current) setMutationPending(false);
    }
  }

  if (accessLost) return <GroupCoachAccessLost />;
  return (
    <section aria-labelledby="group-coaches-heading" className="space-y-4">
      <div>
        <h2 id="group-coaches-heading" className="text-2xl font-semibold tracking-tight text-white">
          Coaches
        </h2>
        <p className="mt-1 text-sm text-slate-400">Assign active coaches to this group.</p>
      </div>
      {notice ? (
        <p role="status" className="text-sm text-emerald-300">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
      {locked ? (
        <p role="status" className="text-sm text-amber-200">
          Refresh this page before another change.
        </p>
      ) : null}
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Assigned coaches</CardTitle>
          <CardDescription className="text-slate-400">
            Only active coach-role memberships can be assigned.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {links.length === 0 ? (
            <p className="text-sm text-slate-400">No coaches assigned.</p>
          ) : null}
          <ul aria-label="Assigned coaches" className="space-y-2">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {candidateByMembership.get(link.membershipId) ?? "Active coach"}
                </span>
                <Button
                  disabled={locked || commandBusy}
                  onClick={() => setRemoving(link)}
                  type="button"
                  variant="outline"
                >
                  Remove coach
                </Button>
              </li>
            ))}
          </ul>
          {linkPage.hasMore ? (
            <Button
              disabled={linksPending}
              onClick={() => void loadMoreLinks()}
              type="button"
              variant="outline"
            >
              {linksPending ? "Loading assigned coaches…" : "Load more assigned coaches"}
            </Button>
          ) : null}
          {committedAssignmentReceipt.current ? (
            <Button
              disabled={linksPending}
              onClick={() => void refreshAssignments()}
              type="button"
              variant="outline"
            >
              {linksPending ? "Refreshing assignments…" : "Refresh assignments"}
            </Button>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <label
              className="grid min-w-0 max-w-full gap-1 text-sm"
              htmlFor="group-coach-candidate"
            >
              Coach
              <select
                className="min-w-0 max-w-full"
                disabled={locked || assignmentBlocked || availableCandidates.length === 0}
                id="group-coach-candidate"
                onChange={(event) => setMembershipId(event.target.value)}
                value={membershipId}
              >
                <option value="">Choose a coach</option>
                {availableCandidates.map((candidate) => (
                  <option key={candidate.membershipId} value={candidate.membershipId}>
                    {candidate.label}
                  </option>
                ))}
              </select>
            </label>
            <Button
              disabled={locked || assignmentBlocked || availableCandidates.length === 0}
              onClick={() => void assign()}
              type="button"
            >
              {mutationPending ? "Saving…" : "Assign coach"}
            </Button>
          </div>
          {committedAssignmentReceipt.current ? (
            <p role="status" className="text-sm text-slate-400">
              Confirming the coach assignment before another assignment.
            </p>
          ) : null}
          {candidatePage.hasMore ? (
            <Button
              disabled={candidatesPending}
              onClick={() => void loadMoreCandidates()}
              type="button"
              variant="outline"
            >
              {candidatesPending ? "Loading coaches…" : "Load more coaches"}
            </Button>
          ) : null}
          {availableCandidates.length === 0 ? (
            <p className="text-sm text-slate-400">No other active coaches are available.</p>
          ) : null}
        </CardContent>
      </Card>
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && !commandBusy && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove coach assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              This coach will no longer be assigned to this group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={commandBusy} type="button">
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={commandBusy}
              onClick={() => void remove()}
              type="button"
              variant="destructive"
            >
              {mutationPending ? "Removing…" : "Remove coach"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function OrganizationGroupCoachesPending() {
  return (
    <p aria-label="Loading coach assignments" role="status" className="text-sm text-slate-400">
      Loading coach assignments…
    </p>
  );
}
export function OrganizationGroupCoachesError() {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } catch {
      // The failed loader remains the only visible assignment state.
    } finally {
      setRetrying(false);
    }
  }
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-red-300">
        We could not load coach assignments.
      </p>
      <Button disabled={retrying} onClick={() => void retry()} type="button">
        {retrying ? "Retrying coach assignments…" : "Retry coach assignments"}
      </Button>
    </div>
  );
}
function GroupCoachAccessLost() {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight text-white">Group access required</h2>
      <p className="mt-1 text-sm text-slate-400">
        Your access changed. Coach assignments are no longer shown.
      </p>
    </section>
  );
}
