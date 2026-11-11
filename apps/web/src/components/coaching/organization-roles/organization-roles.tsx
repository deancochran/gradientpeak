import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Label } from "@repo/ui/components/label";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  type OrganizationRoleCommand,
  submitOrganizationRoleCommand,
} from "../../../lib/coaching/organization-roles-server-functions";

type Role = "admin" | "coach";
type Mutation = "grant" | "revoke";
type StaffMember = {
  membershipId: string;
  identity: { displayName: string | null; username: string | null };
  roleKeys: Role[];
  actions: Record<
    "grantAdmin" | "revokeAdmin" | "grantCoach" | "revokeCoach",
    { eligible: boolean }
  >;
};
type StaffPage = { items: StaffMember[]; nextCursor: string | null; hasMore: boolean };
type Preview = OrganizationRoleCommand & { currentRoles: Role[]; memberLabel: string };

const roleLabels: Record<Role, string> = { admin: "Admin", coach: "Coach" };

export function OrganizationRoles({
  actorProfileId,
  organizationId,
  page,
}: {
  actorProfileId: string;
  organizationId: string;
  page: StaffPage;
}) {
  return (
    <OrganizationRolesContents
      key={`${actorProfileId}:${organizationId}`}
      actorProfileId={actorProfileId}
      organizationId={organizationId}
      page={page}
    />
  );
}

function OrganizationRolesContents({
  actorProfileId: _actorProfileId,
  organizationId,
  page,
}: {
  actorProfileId: string;
  organizationId: string;
  page: StaffPage;
}) {
  const router = useRouter();
  const mounted = useRef(true);
  const submitting = useRef(false);
  const [membershipId, setMembershipId] = useState("");
  const [role, setRole] = useState<Role>("coach");
  const [mutation, setMutation] = useState<Mutation>("grant");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState<Preview | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const member = useMemo(
    () => page.items.find((item) => item.membershipId === membershipId) ?? null,
    [membershipId, page.items],
  );
  const eligible = member ? actionFor(mutation, role, member).eligible : false;
  const interactionLocked = saving || Boolean(outcomeUnknown) || refreshRequired;
  const clearPreview = () => {
    if (outcomeUnknown) return;
    setPreview(null);
    setReceipt(null);
    setError(null);
  };
  const selectMember = (next: string) => {
    if (interactionLocked) return;
    setMembershipId(next);
    clearPreview();
  };
  const selectRole = (next: Role) => {
    if (interactionLocked) return;
    setRole(next);
    clearPreview();
  };
  const selectMutation = (next: Mutation) => {
    if (interactionLocked) return;
    setMutation(next);
    clearPreview();
  };
  const makePreview = () => {
    if (interactionLocked) return;
    if (!member || !eligible) {
      setError(
        "This role change is not currently available. Refresh the staff roster and try again.",
      );
      return;
    }
    setPreview({
      organizationId,
      membershipId: member.membershipId,
      mutation,
      operationId: crypto.randomUUID(),
      role,
      currentRoles: member.roleKeys,
      memberLabel: memberLabel(member),
    });
    setError(null);
  };
  const submit = async (frozen: Preview) => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    let confirmed = false;
    try {
      const response = await submitOrganizationRoleCommand(frozen);
      if (!mounted.current) return;
      if (response.status === "access_lost") {
        setAccessLost(true);
        setPreview(null);
        setOutcomeUnknown(null);
        return;
      }
      const expected = frozen.mutation === "grant" ? "granted" : "revoked";
      if (
        response.status !== expected ||
        response.membershipId !== frozen.membershipId ||
        response.role !== frozen.role ||
        response.operationId !== frozen.operationId
      ) {
        setOutcomeUnknown(frozen);
        setError(
          "We could not reconcile the server receipt. Your frozen preview is retained; retry it after reviewing the staff roster.",
        );
        return;
      }
      confirmed = true;
      setReceipt(`Server receipt received for ${frozen.memberLabel}.`);
      setPreview(null);
      setOutcomeUnknown(null);
      try {
        await router.invalidate();
      } catch {
        if (mounted.current) {
          setRefreshRequired(true);
          setError(
            "The role change was confirmed, but the staff roster could not refresh. Refresh before making another change.",
          );
        }
      }
    } catch {
      if (mounted.current && !confirmed) {
        setOutcomeUnknown(frozen);
        setError(
          "We could not confirm whether this change completed. Your frozen preview is retained; retry the same request.",
        );
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const retryRefresh = async () => {
    if (saving) return;
    setError(null);
    try {
      await router.invalidate();
      if (mounted.current) setRefreshRequired(false);
    } catch {
      if (mounted.current)
        setError(
          "The staff roster still could not refresh. No new role change is available until it does.",
        );
    }
  };

  if (accessLost)
    return (
      <p role="alert" className="text-sm text-red-300">
        Your administrative access changed. Organization roles are no longer shown.
      </p>
    );

  return (
    <section aria-labelledby="organization-roles-heading" className="space-y-6">
      <Card className="border-cyan-900 bg-slate-950 text-slate-50">
        <CardHeader>
          <CardTitle id="organization-roles-heading">Organization roles</CardTitle>
          <CardDescription className="text-slate-400">
            Review one fixed Admin or Coach role change before saving. Admin grants are available
            only to the organization root owner; the server checks current authority again when
            saved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {receipt ? (
            <p role="status" className="text-sm text-emerald-300">
              {receipt}{" "}
              <Link
                className="underline"
                to="/organizations/$organizationId/audit"
                params={{ organizationId }}
              >
                Review Audit history
              </Link>
              .
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
          {refreshRequired ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-200">
                Current role controls are hidden until the authoritative staff roster refreshes.
              </p>
              <Button type="button" onClick={() => void retryRefresh()}>
                Refresh staff roster
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="role-member">Staff member</Label>
                  <select
                    id="role-member"
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-50"
                    disabled={interactionLocked}
                    value={membershipId}
                    onChange={(event) => selectMember(event.target.value)}
                  >
                    <option value="">Choose a staff member</option>
                    {page.items.map((item) => (
                      <option key={item.membershipId} value={item.membershipId}>
                        {memberLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>
                <fieldset className="space-y-2" disabled={interactionLocked}>
                  <legend className="text-sm font-medium">Fixed role</legend>
                  <div className="flex gap-2">
                    <RoleButton active={role === "coach"} onClick={() => selectRole("coach")}>
                      Coach
                    </RoleButton>
                    <RoleButton active={role === "admin"} onClick={() => selectRole("admin")}>
                      Admin
                    </RoleButton>
                  </div>
                </fieldset>
                <fieldset className="space-y-2" disabled={interactionLocked}>
                  <legend className="text-sm font-medium">Change</legend>
                  <div className="flex gap-2">
                    <RoleButton
                      active={mutation === "grant"}
                      onClick={() => selectMutation("grant")}
                    >
                      Grant
                    </RoleButton>
                    <RoleButton
                      active={mutation === "revoke"}
                      onClick={() => selectMutation("revoke")}
                    >
                      Revoke
                    </RoleButton>
                  </div>
                </fieldset>
              </div>
              {member ? (
                <p className="text-sm text-slate-300">
                  Current roles for {memberLabel(member)}:{" "}
                  {member.roleKeys.length
                    ? member.roleKeys.map((item) => roleLabels[item]).join(", ")
                    : "No fixed staff role"}
                  .
                </p>
              ) : null}
              <Button
                type="button"
                disabled={!member || !eligible || interactionLocked || Boolean(preview)}
                onClick={makePreview}
                className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
              >
                Preview role change
              </Button>
              {member && !eligible ? (
                <p className="text-sm text-amber-200">
                  This change is unavailable for your current role or this staff member. It has not
                  been requested or saved.
                </p>
              ) : null}
              {page.items.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No active staff are available on this authorized page. Review the{" "}
                  <Link
                    className="underline"
                    to="/organizations/$organizationId/staff"
                    params={{ organizationId }}
                    search={{ status: "active", cursor: undefined }}
                  >
                    Staff roster
                  </Link>
                  .
                </p>
              ) : null}
              {page.hasMore ? (
                <p className="text-sm text-slate-400">
                  This page contains at most the first 50 authorized active staff, not the full
                  roster. Use the{" "}
                  <Link
                    className="underline"
                    to="/organizations/$organizationId/staff"
                    params={{ organizationId }}
                    search={{ status: "active", cursor: undefined }}
                  >
                    Staff roster
                  </Link>{" "}
                  to review additional staff before changing a role.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
      {preview ? (
        <RolePreview
          preview={preview}
          saving={saving}
          outcomeUnknown={Boolean(outcomeUnknown)}
          onCancel={clearPreview}
          onSave={() => void submit(preview)}
        />
      ) : null}
    </section>
  );
}

function RolePreview({
  preview,
  saving,
  outcomeUnknown,
  onCancel,
  onSave,
}: {
  preview: Preview;
  saving: boolean;
  outcomeUnknown: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const action = `${preview.mutation === "grant" ? "Grant" : "Revoke"} ${roleLabels[preview.role]}`;
  const current = preview.currentRoles.includes(preview.role);
  const proposed = preview.mutation === "grant";
  return (
    <Card className="border-cyan-700 bg-slate-900 text-slate-50">
      <CardHeader>
        <CardTitle>Confirm role change</CardTitle>
        <CardDescription className="text-slate-400">
          This frozen preview is the only change that can be saved. Editing the staff member, role,
          organization, or actor starts a new preview.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-400">Staff member</dt>
            <dd>{preview.memberLabel}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Operation</dt>
            <dd>{action}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Current role</dt>
            <dd>
              {current
                ? `Includes ${roleLabels[preview.role]}`
                : `Does not include ${roleLabels[preview.role]}`}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Proposed role</dt>
            <dd>
              {proposed
                ? `Includes ${roleLabels[preview.role]}`
                : `Does not include ${roleLabels[preview.role]}`}
            </dd>
          </div>
        </dl>
        {preview.mutation === "revoke" && preview.role === "coach" ? (
          <p className="text-sm text-amber-200">
            Revoking Coach ends existing direct and group coaching assignments. It does not estimate
            an affected count.
          </p>
        ) : null}
        <p className="text-sm text-slate-400">
          Roles do not grant messaging, exports, billing, or plan-editing capabilities. Training or
          private-athlete access requires a separate assignment and consent.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={saving || outcomeUnknown}
            onClick={onCancel}
            className="border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white focus-visible:ring-cyan-300 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
          >
            Back to edit
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
          >
            {saving ? "Saving…" : outcomeUnknown ? `Retry same ${action} role` : `${action} role`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? "border border-cyan-300 bg-cyan-400 text-slate-950 hover:bg-cyan-300 focus-visible:ring-cyan-300 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
          : "border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white focus-visible:ring-cyan-300 disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
      }
    >
      {children}
    </Button>
  );
}
function actionFor(mutation: Mutation, role: Role, member: StaffMember) {
  return member.actions[
    mutation === "grant"
      ? role === "admin"
        ? "grantAdmin"
        : "grantCoach"
      : role === "admin"
        ? "revokeAdmin"
        : "revokeCoach"
  ];
}
function memberLabel(member: StaffMember) {
  return member.identity.displayName ?? member.identity.username ?? "Organization staff member";
}
