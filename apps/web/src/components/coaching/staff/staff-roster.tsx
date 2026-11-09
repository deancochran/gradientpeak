import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
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
import { Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  grantOrganizationStaffRole,
  loadOrganizationStaffOffboardingImpact,
  resumeOrganizationStaffMembership,
  revokeOrganizationStaffRole,
  suspendOrganizationStaffMembership,
} from "../../../lib/coaching/staff-server-functions";

const PAGE_SIZE = 20;
const darkOutlineControl =
  "border-slate-600 bg-slate-950 text-slate-100 hover:bg-slate-800 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:border-slate-800 disabled:bg-slate-900 disabled:text-slate-500 disabled:hover:bg-slate-900 disabled:hover:text-slate-500";
const selectedStatusControl =
  "bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";
type StaffStatus = "active" | "suspended";
type StaffAction =
  | "suspend"
  | "resume"
  | "grant_admin"
  | "revoke_admin"
  | "grant_coach"
  | "revoke_coach";
type StaffMember = {
  membershipId: string;
  identity: { profileId: string; displayName: string | null; username: string | null };
  roleKeys: Array<"admin" | "coach">;
  status: StaffStatus;
  suspendedAt: Date | null;
  endMembership: { eligible: boolean; reason: "self" | "root_owner" | "admin_target" | null };
  actions: Record<
    "suspend" | "resume" | "grantAdmin" | "revokeAdmin" | "grantCoach" | "revokeCoach",
    { eligible: boolean }
  >;
};
type StaffPage = { items: StaffMember[]; nextCursor: string | null; hasMore: boolean };
type OffboardingImpact = {
  target: {
    membershipId: string;
    identity: StaffMember["identity"];
    offboarding: { eligible: boolean; reason: "self" | "root_owner" | "admin_target" | null };
  };
  assignedAthleteCount: number;
  assignedAthletes: Array<{
    engagementId: string;
    profileId: string;
    displayName: string | null;
    username: string | null;
    assignmentKinds: Array<"primary" | "supporting">;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
  resourceInventory: { status: "unavailable" };
};
type Command = {
  membershipId: string;
  operationId: string;
  action: StaffAction;
  role?: "admin" | "coach";
  reason?: "administrative_review";
};

export function StaffRoster({
  organizationId,
  page,
  status,
  cursor,
}: {
  organizationId: string;
  page: StaffPage;
  status: StaffStatus;
  cursor?: string;
}) {
  return (
    <StaffRosterContents
      key={`${organizationId}:${status}:${cursor ?? "first"}`}
      organizationId={organizationId}
      page={page}
      status={status}
      {...(cursor === undefined ? {} : { cursor })}
    />
  );
}

function StaffRosterContents({
  organizationId,
  page,
  status,
  cursor,
}: {
  organizationId: string;
  page: StaffPage;
  status: StaffStatus;
  cursor?: string;
}) {
  const router = useRouter();
  const current = useRef(true);
  const authorizedPage = useRef(page);
  const inFlight = useRef(false);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [action, setAction] = useState<StaffAction | null>(null);
  const [reason, setReason] = useState<"administrative_review">("administrative_review");
  const [uncertain, setUncertain] = useState<Command | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const [offboardingMember, setOffboardingMember] = useState<StaffMember | null>(null);

  useEffect(() => {
    current.current = true;
    return () => {
      current.current = false;
    };
  }, []);
  // This component only receives `page` from the granted route branch. Keep an
  // access-loss fence through failed/denied revalidation, and clear it only once
  // a fresh authorized loader snapshot replaces the prior page.
  useEffect(() => {
    if (authorizedPage.current === page) return;
    authorizedPage.current = page;
    setAccessLost(false);
  }, [page]);

  const refresh = async () => {
    try {
      await router.invalidate();
      if (!current.current) return;
      setLocked(false);
      setError(null);
      setNotice(null);
    } catch {
      if (current.current)
        setError(
          "The staff roster could not refresh. No new staff action is available until it does.",
        );
    }
  };
  const close = () => {
    if (!inFlight.current && !uncertain) {
      setSelected(null);
      setAction(null);
      setError(null);
    }
  };
  const submit = async (command?: Command) => {
    const member = selected;
    if (!member || (locked && !command) || inFlight.current) return;
    const nextAction = command?.action ?? action;
    if (!nextAction) return;
    const next = command ?? commandFor(member, nextAction, reason);
    if (next.membershipId !== member.membershipId) return;
    inFlight.current = true;
    setError(null);
    try {
      const response = await executeCommand(organizationId, next);
      if (!current.current) return;
      if (response.status === "access_lost") {
        setSelected(null);
        setAction(null);
        setUncertain(null);
        setLocked(false);
        setError(null);
        setNotice(null);
        setAccessLost(true);
        return;
      }
      const expectedStatus = commandStatus(next.action);
      // Never paint an idempotency receipt over the displayed row. A receipt is
      // historical until a fresh, same-scope authoritative read confirms it.
      if (
        response.membershipId !== next.membershipId ||
        response.status !== expectedStatus ||
        !("operationId" in response) ||
        response.operationId !== next.operationId ||
        (next.role !== undefined && (!("role" in response) || response.role !== next.role))
      ) {
        setLocked(true);
        setError(
          "The command response could not be reconciled. Refresh the roster before another action.",
        );
        return;
      }
      setUncertain(null);
      setSelected(null);
      setNotice(
        `${displayIdentity(member.identity)} ${commandPastTense(next.action)}. Roster status was reread.`,
      );
      try {
        await router.invalidate();
        if (!current.current) return;
      } catch {
        if (current.current) {
          setLocked(true);
          setNotice(
            `${displayIdentity(member.identity)} ${commandPastTense(next.action)}, but the roster could not refresh. Refresh before another action.`,
          );
        }
      }
    } catch {
      if (current.current) {
        setUncertain(next);
        setLocked(true);
        setError(
          `We could not confirm whether this staff change completed. Retry this exact command after reconciling the roster.`,
        );
      }
    } finally {
      inFlight.current = false;
    }
  };
  const selectedAction = uncertain?.action ?? action;
  const selectedProtected = selectedAction ? !isEligible(selected, selectedAction) : false;
  const selectedCommand = uncertain?.membershipId === selected?.membershipId ? uncertain : null;

  if (accessLost) return <StaffAccessLost />;

  return (
    <section aria-labelledby="staff-roster-heading" className="space-y-5">
      <div className="space-y-1">
        <h1 id="staff-roster-heading" className="text-3xl font-semibold tracking-tight text-white">
          Staff roster
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Review active and suspended administrative memberships. Suspension ends active coaching
          assignments; resuming does not restore them or grant private-athlete access.
        </p>
      </div>
      <nav aria-label="Staff status" className="flex flex-wrap gap-2">
        <StatusLink
          organizationId={organizationId}
          status="active"
          selected={status === "active"}
        />
        <StatusLink
          organizationId={organizationId}
          status="suspended"
          selected={status === "suspended"}
        />
      </nav>
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
        <Button type="button" onClick={() => void refresh()}>
          Refresh roster
        </Button>
      ) : null}
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>{status === "active" ? "Active staff" : "Suspended staff"}</CardTitle>
          <CardDescription className="text-slate-400">
            {page.items.length} shown on this page
          </CardDescription>
        </CardHeader>
        <CardContent>
          {page.items.length === 0 ? (
            <p className="text-sm text-slate-400">No {status} staff on this page.</p>
          ) : (
            <ul
              aria-label={`${status === "active" ? "Active" : "Suspended"} staff roster`}
              className="space-y-3"
            >
              {page.items.map((member) => {
                const label = member.status === "active" ? "Suspend" : "Resume";
                const statusEligible =
                  member.actions[member.status === "active" ? "suspend" : "resume"].eligible;
                return (
                  <li
                    key={member.membershipId}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">{displayIdentity(member.identity)}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {member.roleKeys.map((role) => (
                          <Badge
                            key={role}
                            className="border-slate-700 bg-slate-800 capitalize text-slate-200"
                          >
                            {role}
                          </Badge>
                        ))}
                        <Badge className="border-slate-700 bg-slate-800 capitalize text-slate-200">
                          {member.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className={darkOutlineControl}
                        disabled={locked || inFlight.current}
                        onClick={() => setOffboardingMember(member)}
                      >
                        Review offboarding impact
                      </Button>
                      {(["admin", "coach"] as const).map((role) => {
                        const hasRole = member.roleKeys.includes(role);
                        const roleAction = `${hasRole ? "revoke" : "grant"}_${role}` as StaffAction;
                        return (
                          <Button
                            key={role}
                            type="button"
                            variant="outline"
                            className={darkOutlineControl}
                            disabled={
                              locked ||
                              inFlight.current ||
                              !member.actions[
                                hasRole
                                  ? role === "admin"
                                    ? "revokeAdmin"
                                    : "revokeCoach"
                                  : role === "admin"
                                    ? "grantAdmin"
                                    : "grantCoach"
                              ].eligible
                            }
                            onClick={() => {
                              setError(null);
                              setSelected(member);
                              setAction(roleAction);
                            }}
                          >
                            {hasRole ? "Revoke" : "Grant"} {role}
                          </Button>
                        );
                      })}
                    </div>
                    {!statusEligible ? (
                      <p className="max-w-sm text-sm text-slate-400">
                        {member.endMembership.reason === "root_owner"
                          ? "The root-owner membership cannot be suspended or resumed."
                          : "Your current authority does not allow this membership status change."}
                      </p>
                    ) : (
                      <Button
                        type="button"
                        variant={member.status === "active" ? "destructive" : "outline"}
                        disabled={locked || inFlight.current || !statusEligible}
                        onClick={() => {
                          setError(null);
                          setSelected(member);
                          setAction(member.status === "active" ? "suspend" : "resume");
                        }}
                      >
                        {label} {displayIdentity(member.identity)}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <StaffPagination
        organizationId={organizationId}
        status={status}
        {...(cursor === undefined ? {} : { cursor })}
        hasMore={page.hasMore}
        nextCursor={page.nextCursor}
      />
      <AlertDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{commandTitle(selectedAction)}</AlertDialogTitle>
            <AlertDialogDescription>{commandImpact(selectedAction)}</AlertDialogDescription>
          </AlertDialogHeader>
          {selectedProtected ? (
            <p role="alert" className="text-sm text-red-300">
              This protected membership cannot be changed.
            </p>
          ) : null}
          {selectedAction === "suspend" || selectedAction === "resume" ? (
            <div className="space-y-2 py-2">
              <Label htmlFor="staff-suspension-reason">Reason</Label>
              <Select
                value={reason}
                onValueChange={(value) => setReason(value as "administrative_review")}
                disabled={Boolean(selectedCommand) || inFlight.current}
              >
                <SelectTrigger id="staff-suspension-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="administrative_review">Administrative review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel
              type="button"
              disabled={inFlight.current || Boolean(selectedCommand)}
              onClick={close}
            >
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant={
                selectedAction === "suspend" || selectedAction?.startsWith("revoke")
                  ? "destructive"
                  : "default"
              }
              disabled={selectedProtected || inFlight.current || (locked && !selectedCommand)}
              onClick={() => void submit(selectedCommand ?? undefined)}
            >
              {inFlight.current
                ? "Submitting…"
                : selectedCommand
                  ? `Retry same ${commandButton(selectedCommand.action)}`
                  : commandButton(selectedAction)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {offboardingMember ? (
        <OffboardingImpactDialog
          key={`${organizationId}:${offboardingMember.membershipId}`}
          organizationId={organizationId}
          member={offboardingMember}
          onClose={() => setOffboardingMember(null)}
        />
      ) : null}
    </section>
  );
}

function OffboardingImpactDialog({
  organizationId,
  member,
  onClose,
}: {
  organizationId: string;
  member: StaffMember;
  onClose: () => void;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error" }
    | { status: "forbidden" }
    | { status: "ready"; impact: OffboardingImpact }
  >({ status: "loading" });
  const attempt = useRef(0);
  const load = useCallback(async () => {
    const request = ++attempt.current;
    setState({ status: "loading" });
    try {
      const result = await loadOrganizationStaffOffboardingImpact({
        data: { organizationId, membershipId: member.membershipId, limit: 20, cursor: null },
      });
      if (request !== attempt.current) return;
      setState(
        result.status === "granted"
          ? { status: "ready", impact: result.impact }
          : { status: "forbidden" },
      );
    } catch {
      if (request === attempt.current) setState({ status: "error" });
    }
  }, [member.membershipId, organizationId]);
  useEffect(() => {
    void load();
    return () => {
      attempt.current += 1;
    };
  }, [load]);
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="border-slate-700 bg-slate-900 text-slate-100">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-slate-50">Review offboarding impact</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-300">
            This is a read-only handover preparation. Ending membership is not available here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.status === "loading" ? (
          <p role="status" className="text-sm text-slate-400">
            Loading offboarding impact…
          </p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-red-300">
            We could not load the offboarding impact. No offboarding action is available.
          </p>
        ) : null}
        {state.status === "forbidden" ? (
          <p role="alert" className="text-sm text-red-300">
            Offboarding impact is no longer available for this staff membership.
          </p>
        ) : null}
        {state.status === "ready" ? <OffboardingImpactDetails impact={state.impact} /> : null}
        <AlertDialogFooter className="text-slate-100">
          {state.status === "error" || state.status === "forbidden" ? (
            <Button
              type="button"
              className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              onClick={() => void load()}
            >
              Retry
            </Button>
          ) : null}
          <AlertDialogCancel
            type="button"
            className="border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-slate-50"
            onClick={onClose}
          >
            Close
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function OffboardingImpactDetails({ impact }: { impact: OffboardingImpact }) {
  const reason = impact.target.offboarding.reason;
  return (
    <div className="space-y-4 text-sm text-slate-300">
      <p>
        <strong className="text-slate-100">{displayIdentity(impact.target.identity)}</strong> has{" "}
        {impact.assignedAthleteCount} assigned{" "}
        {impact.assignedAthleteCount === 1 ? "athlete" : "athletes"}.
      </p>
      {reason ? (
        <p role="status">
          {reason === "self"
            ? "You cannot offboard your own membership."
            : reason === "root_owner"
              ? "The root-owner membership cannot be offboarded."
              : "An administrator cannot offboard another administrator."}
        </p>
      ) : (
        <p>Start a handover before any future offboarding workflow is completed.</p>
      )}
      {impact.assignedAthletes.length ? (
        <ul aria-label="Assigned athletes" className="space-y-2">
          {impact.assignedAthletes.map((athlete) => (
            <li key={athlete.engagementId}>
              {athlete.displayName ?? athlete.username ?? "Assigned athlete"} —{" "}
              {athlete.assignmentKinds.join(", ")}
            </li>
          ))}
        </ul>
      ) : (
        <p>No active athlete assignments were found.</p>
      )}
      {impact.hasMore ? (
        <p>More assigned athletes are available in the future handover workflow.</p>
      ) : null}
      <p>
        Owned shared-library resources are unavailable and have not been assessed. Personal notes
        are excluded.
      </p>
    </div>
  );
}

function StatusLink({
  organizationId,
  status,
  selected,
}: {
  organizationId: string;
  status: StaffStatus;
  selected: boolean;
}) {
  return (
    <Button
      asChild
      variant={selected ? "default" : "outline"}
      className={selected ? selectedStatusControl : darkOutlineControl}
    >
      <Link
        to="/organizations/$organizationId/staff"
        params={{ organizationId }}
        search={{ status, cursor: undefined }}
        aria-current={selected ? "page" : undefined}
      >
        {status === "active" ? "Active" : "Suspended"}
      </Link>
    </Button>
  );
}
function StaffPagination({
  organizationId,
  status,
  cursor,
  hasMore,
  nextCursor,
}: {
  organizationId: string;
  status: StaffStatus;
  cursor?: string;
  hasMore: boolean;
  nextCursor: string | null;
}) {
  if (!cursor && !hasMore) return null;
  return (
    <nav aria-label="Staff roster pages" className="flex flex-wrap gap-3">
      {cursor ? (
        <Button asChild variant="outline" className={darkOutlineControl}>
          <Link
            to="/organizations/$organizationId/staff"
            params={{ organizationId }}
            search={{ status, cursor: undefined }}
          >
            First page
          </Link>
        </Button>
      ) : null}
      {hasMore && nextCursor ? (
        <Button asChild>
          <Link
            to="/organizations/$organizationId/staff"
            params={{ organizationId }}
            search={{ status, cursor: nextCursor }}
          >
            Next page
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}
export function StaffRosterPending() {
  return (
    <p role="status" aria-live="polite" className="text-sm text-slate-400">
      Loading staff roster…
    </p>
  );
}

function commandFor(
  member: StaffMember,
  action: StaffAction,
  reason: "administrative_review",
): Command {
  const role = action.endsWith("admin") ? "admin" : action.endsWith("coach") ? "coach" : undefined;
  return {
    membershipId: member.membershipId,
    operationId: crypto.randomUUID(),
    action,
    ...(role ? { role } : {}),
    ...(role ? {} : { reason }),
  };
}
function isEligible(member: StaffMember | null, action: StaffAction) {
  if (!member) return false;
  return member.actions[
    (
      {
        suspend: "suspend",
        resume: "resume",
        grant_admin: "grantAdmin",
        revoke_admin: "revokeAdmin",
        grant_coach: "grantCoach",
        revoke_coach: "revokeCoach",
      } as const
    )[action]
  ].eligible;
}
async function executeCommand(organizationId: string, command: Command) {
  if (command.role) {
    return (
      command.action.startsWith("grant") ? grantOrganizationStaffRole : revokeOrganizationStaffRole
    )({
      data: {
        organizationId,
        membershipId: command.membershipId,
        role: command.role,
        operationId: command.operationId,
      },
    });
  }
  return (
    command.action === "suspend"
      ? suspendOrganizationStaffMembership
      : resumeOrganizationStaffMembership
  )({
    data: {
      organizationId,
      membershipId: command.membershipId,
      operationId: command.operationId,
      reason: command.reason ?? "administrative_review",
    },
  });
}
function commandStatus(action: StaffAction) {
  return action === "suspend"
    ? "suspended"
    : action === "resume"
      ? "resumed"
      : action.startsWith("grant")
        ? "granted"
        : "revoked";
}
function commandButton(action: StaffAction | null) {
  return action
    ? (
        {
          suspend: "Suspend membership",
          resume: "Resume membership",
          grant_admin: "Grant admin",
          revoke_admin: "Revoke admin",
          grant_coach: "Grant coach",
          revoke_coach: "Revoke coach",
        } as const
      )[action]
    : "Confirm staff change";
}
function commandTitle(action: StaffAction | null) {
  return action ? `${commandButton(action)}?` : "Confirm staff change";
}
function commandPastTense(action: StaffAction) {
  return (
    {
      suspend: "was suspended",
      resume: "was resumed",
      grant_admin: "was granted the admin role",
      revoke_admin: "had the admin role revoked",
      grant_coach: "was granted the coach role",
      revoke_coach: "had the coach role revoked",
    } as const
  )[action];
}
function commandImpact(action: StaffAction | null) {
  if (action === "suspend")
    return "Suspension ends this member’s active coaching assignments. It does not end their membership, change roles, or grant private-athlete access.";
  if (action === "resume")
    return "Resuming restores membership status only. It does not restore ended coaching assignments, change roles, or grant private-athlete access.";
  return "This changes an administrative role only. It does not create coaching assignments, consent, or private-athlete access.";
}
export function StaffRosterError({
  organizationId,
  status,
}: {
  organizationId: string;
  status: StaffStatus;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-50">
      <CardContent className="flex flex-wrap items-center gap-3 py-6">
        <p role="alert" className="text-sm text-slate-400">
          We could not load the staff roster.
        </p>
        <Button asChild>
          <Link
            to="/organizations/$organizationId/staff"
            params={{ organizationId }}
            search={{ status, cursor: undefined }}
          >
            Return to first page
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function StaffAccessLost() {
  const router = useRouter();
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-50">
      <CardContent className="flex flex-wrap items-center gap-3 py-6">
        <p role="alert" className="text-sm text-slate-400">
          Your organization staff-management access has changed. Reauthorize the roster before
          taking another action.
        </p>
        <Button type="button" onClick={() => void router.invalidate()}>
          Reauthorize roster
        </Button>
      </CardContent>
    </Card>
  );
}
function displayIdentity(identity: StaffMember["identity"]) {
  return identity.displayName ?? identity.username ?? "Organization member";
}

export { PAGE_SIZE };
