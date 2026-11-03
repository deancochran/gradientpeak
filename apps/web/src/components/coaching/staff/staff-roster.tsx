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
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { endOrganizationStaffMembership } from "../../../lib/coaching/staff-server-functions";

const PAGE_SIZE = 20;

type StaffMember = {
  membershipId: string;
  identity: { profileId: string; displayName: string | null; username: string | null };
  roleKeys: Array<"admin" | "coach">;
  endMembership: { eligible: boolean; reason: "self" | "root_owner" | "admin_target" | null };
};

type StaffPage = { items: StaffMember[]; nextCursor: string | null; hasMore: boolean };

export function StaffRoster({
  organizationId,
  page,
  cursor,
}: {
  organizationId: string;
  page: StaffPage;
  cursor?: string;
}) {
  return (
    <StaffRosterContents
      key={organizationId}
      organizationId={organizationId}
      page={page}
      {...(cursor === undefined ? {} : { cursor })}
    />
  );
}

function StaffRosterContents({
  organizationId,
  page,
  cursor,
}: {
  organizationId: string;
  page: StaffPage;
  cursor?: string;
}) {
  const router = useRouter();
  const current = useRef(true);
  const inFlight = useRef(false);
  const uncertain = useRef<{ membershipId: string; correlationId: string } | null>(null);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const form = useForm({ defaultValues: { reason: "staff_departure" as const } });
  useEffect(() => {
    current.current = true;
    return () => {
      current.current = false;
    };
  }, []);

  const close = () => {
    if (!form.formState.isSubmitting && !inFlight.current) {
      setSelected(null);
      setError(null);
    }
  };
  const refresh = async () => {
    try {
      await router.invalidate();
      if (!current.current) {
        inFlight.current = false;
        return;
      }
      setLocked(false);
      setError(null);
      setNotice(null);
    } catch {
      if (current.current)
        setError(
          "The roster could not refresh. No membership changes are available until it does.",
        );
    }
  };
  const submit = async () => {
    if (!selected || locked || inFlight.current) return;
    inFlight.current = true;
    const prior = uncertain.current;
    if (prior && prior.membershipId !== selected.membershipId) {
      setError(
        "We could not confirm the previous departure. Refresh the roster before ending another membership.",
      );
      inFlight.current = false;
      return;
    }
    const correlationId = prior?.correlationId ?? crypto.randomUUID();
    try {
      const response = await endOrganizationStaffMembership({
        data: {
          organizationId,
          membershipId: selected.membershipId,
          reason: "staff_departure",
          correlationId,
        },
      });
      if (!current.current) return;
      if (response.status === "access_lost") {
        setLocked(true);
        setError("Your access has changed. Refresh the roster before taking another action.");
        inFlight.current = false;
        return;
      }
    } catch {
      if (current.current) {
        uncertain.current = { membershipId: selected.membershipId, correlationId };
        setError(
          "We could not confirm whether the membership ended. Retry the same departure; do not change the member.",
        );
      }
      inFlight.current = false;
      return;
    }
    if (!current.current) {
      inFlight.current = false;
      return;
    }
    uncertain.current = null;
    const name = displayIdentity(selected.identity);
    setSelected(null);
    setNotice(`${name}'s membership ended.`);
    try {
      await router.invalidate();
      if (!current.current) {
        inFlight.current = false;
        return;
      }
    } catch {
      if (current.current) {
        setLocked(true);
        setNotice(
          `${name}'s membership ended, but the roster could not refresh. Refresh the page before another change.`,
        );
      }
    }
    inFlight.current = false;
  };
  if (page.items.length === 0) {
    return cursor ? <EmptyStaffPage organizationId={organizationId} /> : <EmptyStaffRoster />;
  }

  return (
    <section aria-labelledby="staff-roster-heading" className="space-y-5">
      <div className="space-y-1">
        <h1 id="staff-roster-heading" className="text-3xl font-semibold tracking-tight text-white">
          Staff roster
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Active administrative memberships only. This roster does not provide access to private
          athlete records. The root-owner membership cannot be ended.
        </p>
      </div>
      {notice ? (
        <p role="status" className="text-sm text-emerald-300">
          {notice}
        </p>
      ) : null}
      {locked ? (
        <div className="flex gap-3" role="status">
          <p className="text-sm text-amber-200">
            Refresh the roster before another membership change.
          </p>
          <Button type="button" onClick={() => void refresh()}>
            Refresh roster
          </Button>
        </div>
      ) : null}
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Active staff</CardTitle>
          <CardDescription className="text-slate-400">{page.items.length} shown</CardDescription>
        </CardHeader>
        <CardContent>
          <ul aria-label="Staff roster" className="space-y-3">
            {page.items.map((member) => (
              <li
                key={member.membershipId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">{displayIdentity(member.identity)}</p>
                  <div className="mt-1 flex gap-1">
                    {member.roleKeys.map((role) => (
                      <Badge
                        key={role}
                        className="border-slate-700 bg-slate-800 capitalize text-slate-200"
                      >
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>
                {member.endMembership.eligible ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={locked || form.formState.isSubmitting}
                    onClick={() => {
                      if (inFlight.current) return;
                      setError(null);
                      setSelected(member);
                    }}
                  >
                    End membership for {displayIdentity(member.identity)}
                  </Button>
                ) : (
                  <p className="max-w-sm text-sm text-slate-400">
                    {member.endMembership.reason === "self"
                      ? "You cannot end your own membership."
                      : member.endMembership.reason === "root_owner"
                        ? "The root-owner membership cannot be ended."
                        : "Only the root owner can end an administrator membership."}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <StaffPagination
        organizationId={organizationId}
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
          <form onSubmit={form.handleSubmit(submit)} noValidate>
            <AlertDialogHeader>
              <AlertDialogTitle>End staff membership?</AlertDialogTitle>
              <AlertDialogDescription>
                End {selected ? displayIdentity(selected.identity) : "this member"}&apos;s active
                membership. Their staff roles and coaching assignments will end.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error ? (
              <p role="alert" className="py-3 text-sm text-red-300">
                {error}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel
                type="button"
                disabled={form.formState.isSubmitting}
                onClick={close}
              >
                Cancel
              </AlertDialogCancel>
              <Button
                type="submit"
                variant="destructive"
                disabled={form.formState.isSubmitting || locked}
              >
                {form.formState.isSubmitting ? "Ending membership…" : "End membership"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function StaffRosterPending() {
  return (
    <p role="status" aria-live="polite" className="text-sm text-slate-400">
      Loading staff roster…
    </p>
  );
}

export function StaffRosterError() {
  const router = useRouter();
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-50">
      <CardContent className="flex flex-wrap items-center gap-3 py-6">
        <p role="alert" className="text-sm text-slate-400">
          We could not load the staff roster.
        </p>
        <Button onClick={() => void router.invalidate()}>Retry</Button>
      </CardContent>
    </Card>
  );
}

function EmptyStaffRoster() {
  return (
    <section aria-labelledby="empty-staff-heading">
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>
            <h1 id="empty-staff-heading">No active staff members</h1>
          </CardTitle>
          <CardDescription className="text-slate-400">
            There are no active staff memberships to administer.
          </CardDescription>
        </CardHeader>
      </Card>
    </section>
  );
}

function EmptyStaffPage({ organizationId }: { organizationId: string }) {
  return (
    <section aria-labelledby="empty-staff-page-heading">
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>
            <h1 id="empty-staff-page-heading">No staff on this page</h1>
          </CardTitle>
          <CardDescription className="text-slate-400">
            This saved page no longer has active staff to show.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link
              to="/organizations/$organizationId/staff"
              params={{ organizationId }}
              search={{ cursor: undefined }}
            >
              Back to first page
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function StaffPagination({
  organizationId,
  cursor,
  hasMore,
  nextCursor,
}: {
  organizationId: string;
  cursor?: string;
  hasMore: boolean;
  nextCursor: string | null;
}) {
  if (!cursor && !hasMore) return null;
  return (
    <nav aria-label="Staff roster pages" className="flex flex-wrap gap-3">
      {cursor ? (
        <Button asChild variant="outline">
          <Link
            to="/organizations/$organizationId/staff"
            params={{ organizationId }}
            search={{ cursor: undefined }}
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
            search={{ cursor: nextCursor }}
          >
            Next page
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}

function displayIdentity(identity: StaffMember["identity"]) {
  return identity.displayName ?? identity.username ?? "Organization member";
}

export { PAGE_SIZE };
