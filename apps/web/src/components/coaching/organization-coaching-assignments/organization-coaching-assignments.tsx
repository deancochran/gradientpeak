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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  assignOrganizationCoach,
  changeOrganizationCoach,
  endOrganizationCoachAssignment,
  loadOrganizationCoachingAssignmentCandidates,
  loadOrganizationCoachingAssignments,
} from "../../../lib/coaching/organization-coaching-assignments-server-functions";

type Assignment = {
  assignmentId: string;
  coachMembershipId: string;
  assignmentKind: "primary" | "supporting";
  assignedAt: Date;
};
type Candidate = { membershipId: string; label: string };
type Page = { items: Candidate[]; nextCursor: string | null; hasMore: boolean };
type Loaded =
  | {
      status: "granted";
      assignments: { items: Assignment[]; stateDigest: string };
      candidates: Page;
    }
  | { status: "forbidden" };
type Intent = {
  action: "assign" | "change" | "end";
  assignment?: Assignment;
  coachMembershipId?: string;
  assignmentKind?: "primary" | "supporting";
  operationId: string;
  expectedStateDigest: string;
};

export function OrganizationCoachingAssignments({
  organizationId,
  engagementId,
  actorProfileId,
  athleteName,
  onClose,
  onAccessLost,
}: {
  organizationId: string;
  engagementId: string;
  actorProfileId: string;
  athleteName: string;
  onClose: () => void;
  onAccessLost: () => void;
}) {
  return (
    <Contents
      key={`${actorProfileId}:${organizationId}:${engagementId}`}
      actorProfileId={actorProfileId}
      organizationId={organizationId}
      engagementId={engagementId}
      athleteName={athleteName}
      onClose={onClose}
      onAccessLost={onAccessLost}
    />
  );
}
function Contents({
  organizationId,
  engagementId,
  actorProfileId: _actorProfileId,
  athleteName,
  onClose,
  onAccessLost,
}: {
  organizationId: string;
  engagementId: string;
  actorProfileId: string;
  athleteName: string;
  onClose: () => void;
  onAccessLost: () => void;
}) {
  const load = useServerFn(loadOrganizationCoachingAssignments);
  const loadCandidates = useServerFn(loadOrganizationCoachingAssignmentCandidates);
  const assign = useServerFn(assignOrganizationCoach);
  const change = useServerFn(changeOrganizationCoach);
  const end = useServerFn(endOrganizationCoachAssignment);
  const current = useRef(true);
  const request = useRef(0);
  const candidateRequest = useRef(0);
  const submitting = useRef(false);
  const refreshing = useRef(false);
  const [saving, setSaving] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [digest, setDigest] = useState("");
  const [candidates, setCandidates] = useState<Page>({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  const [choice, setChoice] = useState("");
  const [kind, setKind] = useState<"primary" | "supporting">("primary");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [uncertain, setUncertain] = useState<Intent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed organization/engagement identity owns a fresh interaction scope.
  useEffect(() => {
    current.current = true;
    void refresh();
    return () => {
      current.current = false;
      request.current += 1;
      candidateRequest.current += 1;
      refreshing.current = false;
    };
  }, []);
  async function refresh(afterMutation = false) {
    if (refreshing.current || (submitting.current && !afterMutation)) return;
    refreshing.current = true;
    const id = ++request.current;
    candidateRequest.current += 1;
    setLoading(true);
    setError(null);
    try {
      const result = (await load({ data: { organizationId, engagementId } })) as Loaded;
      if (!current.current || id !== request.current) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        onAccessLost();
        return;
      }
      setAssignments(result.assignments.items);
      setDigest(result.assignments.stateDigest);
      setCandidates(result.candidates);
    } catch {
      if (current.current && id === request.current)
        setError("Coaching responsibilities could not be loaded. No change was made.");
    } finally {
      if (current.current && id === request.current) {
        refreshing.current = false;
        setLoading(false);
      }
    }
  }
  async function moreCandidates() {
    if (candidatesLoading || intent || uncertain || !candidates.hasMore || !candidates.nextCursor)
      return;
    const cursor = candidates.nextCursor;
    const id = ++candidateRequest.current;
    setCandidatesLoading(true);
    try {
      const result = await loadCandidates({
        data: { organizationId, limit: 50, cursor },
      });
      if (!current.current || id !== candidateRequest.current) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        onAccessLost();
        return;
      }
      setCandidates((old) => ({
        ...result.page,
        items: [
          ...old.items,
          ...result.page.items.filter(
            (item) => !old.items.some((oldItem) => oldItem.membershipId === item.membershipId),
          ),
        ],
      }));
    } catch {
      if (current.current && id === candidateRequest.current)
        setError("Eligible coaches could not be loaded. Your selection is unchanged.");
    } finally {
      if (current.current && id === candidateRequest.current) setCandidatesLoading(false);
    }
  }
  function start(action: Intent["action"], assignment?: Assignment) {
    if (uncertain || loading || candidatesLoading) return;
    const coachMembershipId = action === "end" ? undefined : choice;
    if ((action === "assign" || action === "change") && !coachMembershipId) {
      setError("Choose an eligible coach before continuing.");
      return;
    }
    setError(null);
    setIntent({
      action,
      ...(assignment ? { assignment } : {}),
      ...(coachMembershipId ? { coachMembershipId } : {}),
      ...(action === "end" ? {} : { assignmentKind: kind }),
      operationId: crypto.randomUUID(),
      expectedStateDigest: digest,
    });
  }
  async function submit(next: Intent) {
    if (submitting.current || refreshing.current) return;
    const assignmentId = next.assignment?.assignmentId;
    const coachMembershipId = next.coachMembershipId;
    const assignmentKind = next.assignmentKind;
    if (
      (next.action !== "end" && (!coachMembershipId || !assignmentKind)) ||
      (next.action !== "assign" && !assignmentId)
    ) {
      setError("This request is incomplete. Refresh current assignments and confirm a new intent.");
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      const common = {
        organizationId,
        engagementId,
        operationId: next.operationId,
        expectedStateDigest: next.expectedStateDigest,
      };
      const result =
        next.action === "assign"
          ? await assign({ data: { ...common, coachMembershipId, assignmentKind } })
          : next.action === "change"
            ? await change({ data: { ...common, assignmentId, coachMembershipId, assignmentKind } })
            : await end({ data: { ...common, assignmentId } });
      if (!current.current) return;
      if (result.status === "access_lost") {
        setAccessLost(true);
        onAccessLost();
        return;
      }
      // A receipt proves only that this operation was accepted; current assignments always come from a reread.
      setIntent(null);
      setUncertain(null);
      setNotice("Responsibility updated. Current assignments were refreshed.");
      await refresh(true);
    } catch (caught) {
      if (!current.current) return;
      const code =
        typeof caught === "object" && caught !== null && "code" in caught
          ? (caught as { code?: unknown }).code
          : undefined;
      if (code === "CONFLICT") {
        setIntent(null);
        setUncertain(null);
        await refresh(true);
        if (current.current)
          setError(
            "Responsibilities changed elsewhere. Current assignments were refreshed; confirm a new intent.",
          );
      } else {
        setIntent(null);
        setUncertain(next);
        setError(
          "We could not confirm whether this change completed. Retry this exact request after reconciling current assignments.",
        );
      }
    } finally {
      submitting.current = false;
      if (current.current) setSaving(false);
    }
  }
  if (accessLost)
    return (
      <p role="alert" className="text-sm text-red-300">
        Your administrative access changed. Coaching responsibilities are no longer shown.
      </p>
    );
  const label = (membershipId: string) =>
    candidates.items.find((candidate) => candidate.membershipId === membershipId)?.label ??
    "Organization coach";
  return (
    <Card className="border-cyan-900 bg-slate-950 text-slate-50">
      <CardHeader>
        <CardTitle>Manage coaching responsibility for {athleteName}</CardTitle>
        <CardDescription className="text-slate-400">
          Direct responsibility is separate from athlete consent and does not grant private training
          access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
        {loading ? (
          <p role="status" className="text-sm text-slate-400">
            Loading responsibilities…
          </p>
        ) : (
          <>
            <ul aria-label="Current coaching responsibilities" className="space-y-2">
              {assignments.length ? (
                assignments.map((assignment) => (
                  <li
                    key={assignment.assignmentId}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      {assignment.assignmentKind} — {label(assignment.coachMembershipId)}
                    </span>
                    <span className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={Boolean(intent || uncertain || loading || candidatesLoading)}
                        onClick={() => start("change", assignment)}
                      >
                        Change
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={Boolean(intent || uncertain || loading || candidatesLoading)}
                        onClick={() => start("end", assignment)}
                      >
                        End
                      </Button>
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-slate-400">No current coaching responsibility.</li>
              )}
            </ul>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="assignment-coach">Eligible coach</Label>
                <Select
                  value={choice}
                  onValueChange={setChoice}
                  disabled={Boolean(intent || uncertain || loading || candidatesLoading)}
                >
                  <SelectTrigger id="assignment-coach">
                    <SelectValue placeholder="Choose coach" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.items.map((candidate) => (
                      <SelectItem key={candidate.membershipId} value={candidate.membershipId}>
                        {candidate.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="assignment-kind">Responsibility</Label>
                <Select
                  value={kind}
                  onValueChange={(value) => setKind(value as "primary" | "supporting")}
                  disabled={Boolean(intent || uncertain || loading || candidatesLoading)}
                >
                  <SelectTrigger id="assignment-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="supporting">Supporting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="self-end">
                <Button
                  type="button"
                  disabled={Boolean(intent || uncertain || loading || candidatesLoading)}
                  onClick={() => start("assign")}
                >
                  Assign coach
                </Button>
              </div>
            </div>
            {candidates.hasMore ? (
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(intent || uncertain || loading || candidatesLoading)}
                onClick={() => void moreCandidates()}
              >
                {candidatesLoading ? "Loading eligible coaches…" : "Load more eligible coaches"}
              </Button>
            ) : null}
          </>
        )}
        {intent || uncertain ? (
          <div className="rounded-md border border-amber-700 p-3">
            <p className="text-sm">
              {uncertain
                ? "Retry the exact unresolved request only after you have reconciled current assignments."
                : `Confirm ${intent?.action ?? "this"} coaching responsibility? This changes direct responsibility only; it does not change consent or training access.`}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                disabled={loading || saving}
                onClick={() => {
                  const next = uncertain ?? intent;
                  if (next) void submit(next);
                }}
              >
                {uncertain ? "Retry exact request" : "Confirm responsibility change"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(uncertain) || loading || saving}
                onClick={() => setIntent(null)}
              >
                Cancel
              </Button>
              {uncertain ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || saving}
                  onClick={() => void refresh()}
                >
                  Refresh current assignments
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={loading || saving || Boolean(uncertain)}
          onClick={() => {
            if (!refreshing.current && !submitting.current && !uncertain) onClose();
          }}
        >
          Back to athlete roster
        </Button>
      </CardContent>
    </Card>
  );
}
