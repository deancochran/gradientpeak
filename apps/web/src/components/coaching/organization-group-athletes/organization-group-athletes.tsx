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
import { useEffect, useRef, useState } from "react";
import {
  addOrganizationGroupAthlete,
  loadOrganizationGroupAthleteCandidates,
  loadOrganizationGroupAthleteLinks,
  removeOrganizationGroupAthlete,
} from "../../../lib/coaching/organization-group-athletes-server-functions";
import { useOrganizationGroupAccessLoss } from "../organization-groups/organization-group-access";

const PAGE_SIZE = 20;
type Athlete = {
  engagementId: string;
  identity: { displayName: string | null; username: string | null };
  status: "active" | "paused";
};
type Link = { id: string; engagementId: string };
type Page<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };
type InitialPage = { links: Page<Link>; candidates: Page<Athlete> };

export function OrganizationGroupAthletesPending() {
  return (
    <p aria-label="Loading athlete assignments" role="status" className="text-sm text-slate-400">
      Loading athlete assignments…
    </p>
  );
}
export function OrganizationGroupAthletesError() {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } catch {
      // Keep the failed loader state visible until an authoritative reread succeeds.
    } finally {
      setRetrying(false);
    }
  }
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-red-300">
        We could not load athlete assignments.
      </p>
      <Button disabled={retrying} onClick={() => void retry()} type="button">
        {retrying ? "Retrying athlete assignments…" : "Retry athlete assignments"}
      </Button>
    </div>
  );
}

export function OrganizationGroupAthletes({
  organizationId,
  groupId,
  initialPage,
}: {
  organizationId: string;
  groupId: string;
  initialPage: InitialPage;
}) {
  const addAthlete = useServerFn(addOrganizationGroupAthlete);
  const accessLoss = useOrganizationGroupAccessLoss();
  const removeAthlete = useServerFn(removeOrganizationGroupAthlete);
  const loadLinks = useServerFn(loadOrganizationGroupAthleteLinks);
  const loadCandidates = useServerFn(loadOrganizationGroupAthleteCandidates);
  const [links, setLinks] = useState(initialPage.links);
  const [candidates, setCandidates] = useState(initialPage.candidates);
  const [selectedEngagementId, setSelectedEngagementId] = useState("");
  const [removal, setRemoval] = useState<Link | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const mounted = useRef(true);
  const identity = useRef({ organizationId, groupId });
  const appliedContext = useRef(`${organizationId}:${groupId}`);
  const hasAppliedInitialPage = useRef(false);
  const linksRequestVersion = useRef(0);
  const candidatesRequestVersion = useRef(0);
  const pendingCommand = useRef<string | null>(null);
  const addOperation = useRef<{ engagementId: string; linkId: string } | null>(null);
  const removedLinkIds = useRef(new Set<string>());
  const addReceipt = useRef<Link | null>(null);
  const refreshLinksRef = useRef<(cursor: string | null) => Promise<void>>(async () => {});
  const labelByEngagementId = useRef(new Map<string, string>());

  const contextKey = `${organizationId}:${groupId}`;
  if (identity.current.organizationId !== organizationId || identity.current.groupId !== groupId) {
    identity.current = { organizationId, groupId };
    // Entity changes always fence reads and commands, even while an old add is settling.
    linksRequestVersion.current += 1;
    candidatesRequestVersion.current += 1;
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const entityChanged = appliedContext.current !== contextKey;
    appliedContext.current = contextKey;
    if (!hasAppliedInitialPage.current || entityChanged) {
      hasAppliedInitialPage.current = true;
      pendingCommand.current = null;
      addOperation.current = null;
      removedLinkIds.current.clear();
      addReceipt.current = null;
      labelByEngagementId.current.clear();
      setSelectedEngagementId("");
      setRemoval(null);
      setNotice(null);
      setError(null);
      setAccessLost(false);
      setIsWriting(false);
      for (const athlete of initialPage.candidates.items)
        labelByEngagementId.current.set(athlete.engagementId, athleteLabel(athlete));
      setLinks(withoutRemovedLinks(initialPage.links, removedLinkIds.current));
      setCandidates(initialPage.candidates);
      setIsLoadingLinks(false);
      setIsLoadingCandidates(false);
      return;
    }
    // Later same-entity loader props have unknown age. Reconcile with one bounded page-one request
    // instead of replacing client state from them. An acknowledged add already owns its refresh.
    if (!pendingCommand.current?.startsWith("add:")) void refreshLinksRef.current(null);
  }, [contextKey, initialPage]);

  function current(context: string) {
    return (
      mounted.current &&
      `${identity.current.organizationId}:${identity.current.groupId}` === context
    );
  }
  function applyLinks(page: Page<Link>) {
    setLinks(withoutRemovedLinks(page, removedLinkIds.current));
  }
  function applyCandidates(page: Page<Athlete>) {
    for (const athlete of page.items)
      labelByEngagementId.current.set(athlete.engagementId, athleteLabel(athlete));
    setCandidates(page);
  }
  async function refreshLinks(cursor: string | null) {
    const context = contextKey;
    const request = ++linksRequestVersion.current;
    setIsLoadingLinks(true);
    try {
      const result = await loadLinks({
        data: { organizationId, groupId, limit: PAGE_SIZE, cursor },
      });
      if (!current(context) || linksRequestVersion.current !== request) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        if (accessLoss) accessLoss.reportAccessLost(accessLoss.scope);
        return;
      }
      applyLinks(
        cursor === null ? result : { ...result, items: [...links.items, ...result.items] },
      );
      const receipt = addReceipt.current;
      if (
        receipt &&
        (result.items.some((link) => link.id === receipt.id) ||
          (cursor === null && !result.hasMore))
      )
        addReceipt.current = null;
    } catch {
      if (current(context) && linksRequestVersion.current === request)
        setError("Athlete assignments could not be refreshed. The committed change is retained.");
    } finally {
      if (current(context) && linksRequestVersion.current === request) setIsLoadingLinks(false);
    }
  }
  refreshLinksRef.current = refreshLinks;
  async function moreCandidates() {
    const context = contextKey;
    const request = ++candidatesRequestVersion.current;
    setIsLoadingCandidates(true);
    try {
      const result = await loadCandidates({
        data: { organizationId, groupId, limit: PAGE_SIZE, cursor: candidates.nextCursor },
      });
      if (!current(context) || candidatesRequestVersion.current !== request) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        if (accessLoss) accessLoss.reportAccessLost(accessLoss.scope);
        return;
      }
      applyCandidates({ ...result, items: [...candidates.items, ...result.items] });
    } catch {
      if (current(context) && candidatesRequestVersion.current === request)
        setError("Eligible athletes could not be refreshed. Your selection is unchanged.");
    } finally {
      if (current(context) && candidatesRequestVersion.current === request)
        setIsLoadingCandidates(false);
    }
  }
  async function add() {
    if (!selectedEngagementId || pendingCommand.current !== null || addReceipt.current !== null)
      return;
    const selected = eligibleCandidates(candidates.items, links.items, undefined).find(
      (athlete) => athlete.engagementId === selectedEngagementId,
    );
    if (!selected) {
      setError("Choose an active, unpaused athlete who is not already assigned.");
      return;
    }
    const context = contextKey;
    // No pre-command page response may overwrite this mutation's receipt.
    linksRequestVersion.current += 1;
    candidatesRequestVersion.current += 1;
    const command = `add:${selected.engagementId}`;
    const linkId =
      addOperation.current?.engagementId === selected.engagementId
        ? addOperation.current.linkId
        : crypto.randomUUID();
    addOperation.current = { engagementId: selected.engagementId, linkId };
    pendingCommand.current = command;
    setIsWriting(true);
    setError(null);
    try {
      const result = await addAthlete({
        data: { organizationId, groupId, linkId, engagementId: selected.engagementId },
      });
      if (!current(context)) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        if (accessLoss) accessLoss.reportAccessLost(accessLoss.scope);
        return;
      }
      const receipt = {
        id: result.id,
        engagementId: selected.engagementId,
      };
      addReceipt.current = receipt;
      setSelectedEngagementId("");
      setNotice(`${athleteLabel(selected)} was assigned to this group.`);
      // A write acknowledgement is distinct from this bounded reconciliation read.
      await refreshLinks(null);
    } catch {
      if (current(context) && addReceipt.current?.engagementId === selected.engagementId)
        setError(
          "The assignment was acknowledged, but the list could not be reconciled. Refresh assignments before making another change.",
        );
      else if (current(context))
        setError(
          "We could not confirm the assignment. Retry only if the athlete is still unassigned.",
        );
    } finally {
      if (pendingCommand.current === command) {
        pendingCommand.current = null;
        if (current(context)) setIsWriting(false);
      }
    }
  }
  async function remove() {
    if (!removal || pendingCommand.current !== null) return;
    const context = contextKey;
    linksRequestVersion.current += 1;
    const command = `remove:${removal.id}`;
    pendingCommand.current = command;
    setIsWriting(true);
    setError(null);
    try {
      const result = await removeAthlete({ data: { organizationId, groupId, linkId: removal.id } });
      if (!current(context)) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        if (accessLoss) accessLoss.reportAccessLost(accessLoss.scope);
        return;
      }
      removedLinkIds.current.add(removal.id);
      setLinks((page) => withoutRemovedLinks(page, removedLinkIds.current));
      setRemoval(null);
      setNotice(
        `${labelByEngagementId.current.get(removal.engagementId) ?? "The athlete"} was removed from this group.`,
      );
      await refreshLinks(null);
    } catch {
      if (current(context))
        setError("We could not confirm the removal. Retry only if the athlete is still assigned.");
    } finally {
      if (pendingCommand.current === command) {
        pendingCommand.current = null;
        if (current(context)) setIsWriting(false);
      }
    }
  }

  if (accessLost) return <GroupAthleteAccessLost />;
  const available = eligibleCandidates(
    candidates.items,
    links.items,
    addReceipt.current?.engagementId,
  );
  return (
    <section aria-labelledby="group-athletes-heading" className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold tracking-tight text-white" id="group-athletes-heading">
          Athletes
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Assign active organization athletes. This view shows identity and engagement metadata
          only.
        </p>
      </header>
      {notice ? (
        <p className="text-sm text-emerald-300" role="status">
          {notice}
        </p>
      ) : null}
      {addReceipt.current ? (
        <p className="text-sm text-amber-300" role="status">
          Assignment confirmed; not in the loaded page. Reconcile this assignment before adding
          another athlete.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Assign an athlete</CardTitle>
          <CardDescription className="text-slate-400">
            Paused and already assigned engagements are unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="group-athlete-selection">
            Eligible athlete
          </label>
          <select
            className="w-full rounded-md border border-slate-700 bg-slate-950 p-2 text-sm"
            disabled={isWriting || addReceipt.current !== null}
            id="group-athlete-selection"
            onChange={(event) => setSelectedEngagementId(event.target.value)}
            value={selectedEngagementId}
          >
            <option value="">Select an active athlete</option>
            {available.map((athlete) => (
              <option key={athlete.engagementId} value={athlete.engagementId}>
                {athleteLabel(athlete)}
              </option>
            ))}
          </select>
          {available.length === 0 ? (
            <p className="text-sm text-slate-400">
              No eligible athletes are available on this page.
            </p>
          ) : null}
          <Button
            disabled={isWriting || !selectedEngagementId || addReceipt.current !== null}
            onClick={add}
            type="button"
          >
            {isWriting ? "Saving assignment…" : "Assign athlete"}
          </Button>
          {candidates.hasMore ? (
            <Button
              disabled={isWriting || isLoadingCandidates}
              onClick={moreCandidates}
              type="button"
              variant="outline"
            >
              {isLoadingCandidates ? "Loading athletes…" : "Load more eligible athletes"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Assigned athletes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {links.items.length === 0 ? (
            <p className="text-sm text-slate-400">No athletes are assigned to this group.</p>
          ) : (
            <ul aria-label="Assigned athletes" className="space-y-2">
              {links.items.map((link) => (
                <li
                  className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
                  key={link.id}
                >
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {labelByEngagementId.current.get(link.engagementId) ??
                      "Assigned organization athlete"}
                  </span>
                  <Button
                    disabled={isWriting || addReceipt.current?.id === link.id}
                    onClick={() => setRemoval(link)}
                    type="button"
                    variant="destructive"
                  >
                    {addReceipt.current?.id === link.id
                      ? "Reconciling assignment…"
                      : "Remove athlete"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {links.hasMore ? (
            <Button
              disabled={isWriting || isLoadingLinks}
              onClick={() => refreshLinks(links.nextCursor)}
              type="button"
              variant="outline"
            >
              {isLoadingLinks ? "Loading assignments…" : "Load more assignments"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
      {removal ? (
        <Card className="border-destructive bg-slate-950 text-slate-50">
          <CardHeader>
            <CardTitle>Remove athlete?</CardTitle>
            <CardDescription className="text-slate-400">
              This removes the athlete from this group, not from the organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button disabled={isWriting} onClick={remove} type="button" variant="destructive">
              {isWriting ? "Removing athlete…" : "Confirm removal"}
            </Button>
            <Button
              disabled={isWriting}
              onClick={() => setRemoval(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}

function eligibleCandidates(
  candidates: Athlete[],
  links: Link[],
  committedEngagementId: string | undefined,
) {
  const assigned = new Set(links.map((link) => link.engagementId));
  if (committedEngagementId) assigned.add(committedEngagementId);
  return candidates.filter(
    (athlete) => athlete.status === "active" && !assigned.has(athlete.engagementId),
  );
}
function withoutRemovedLinks(page: Page<Link>, removed: ReadonlySet<string>): Page<Link> {
  return { ...page, items: page.items.filter((link) => !removed.has(link.id)) };
}
function athleteLabel(athlete: Athlete) {
  const name = athlete.identity.displayName ?? athlete.identity.username ?? "Organization athlete";
  return athlete.identity.username && athlete.identity.username !== name
    ? `${name} (@${athlete.identity.username})`
    : name;
}
function GroupAthleteAccessLost() {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight text-white">Group access required</h2>
      <p className="mt-1 text-sm text-slate-400">
        Your access changed or this group is no longer active. Athlete assignments are no longer
        shown.
      </p>
    </section>
  );
}
