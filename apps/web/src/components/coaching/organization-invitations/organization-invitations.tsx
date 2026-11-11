import type { OrganizationInvitationSummary } from "@repo/core/organizations";
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
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { buildOrganizationInvitationLink } from "../../../lib/coaching/invitation-handoff";
import {
  createOrganizationInvitation,
  revokeOrganizationInvitation,
} from "../../../lib/coaching/organization-invitations-server-functions";

export const INVITATION_PAGE_SIZE = 20;
export type Invitation = OrganizationInvitationSummary;
export type InvitationPage = {
  items: readonly Invitation[];
  nextCursor: string | null;
  hasMore: boolean;
};
type InvitationDraft = {
  kind: "staff" | "athlete";
  requestedRole: "admin" | "coach";
  recipientEmail: string;
  expiresAt: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function futureLocalDateTime() {
  return new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);
}
function effectiveStatus(invitation: Invitation) {
  return invitation.status === "pending" && Date.parse(invitation.expiresAt) <= Date.now()
    ? "expired"
    : invitation.status;
}

export function OrganizationInvitations({
  organizationId,
  actorProfileId,
  canInviteAdministrators,
  page,
  cursor,
}: {
  organizationId: string;
  actorProfileId: string;
  canInviteAdministrators: boolean;
  page: InvitationPage;
  cursor?: string;
}) {
  return (
    <OrganizationInvitationsContents
      key={`${organizationId}:${actorProfileId}`}
      organizationId={organizationId}
      actorProfileId={actorProfileId}
      canInviteAdministrators={canInviteAdministrators}
      page={page}
      {...(cursor === undefined ? {} : { cursor })}
    />
  );
}

export function OrganizationInvitationsPending() {
  return (
    <section aria-labelledby="organization-invitations-pending-heading" className="space-y-5">
      <div className="space-y-1">
        <h1
          id="organization-invitations-pending-heading"
          className="text-3xl font-semibold tracking-tight text-white"
        >
          Organization invitations
        </h1>
        <p
          role="status"
          aria-label="Loading organization invitations"
          aria-live="polite"
          className="text-sm text-slate-400"
        >
          Loading organization invitations…
        </p>
      </div>
      <div aria-hidden="true" className="space-y-5">
        <div className="h-56 animate-pulse rounded-lg border border-slate-800 bg-slate-900" />
        <div className="h-40 animate-pulse rounded-lg border border-slate-800 bg-slate-900" />
      </div>
    </section>
  );
}

export function OrganizationInvitationsError() {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      // Keep this boundary in place until a fresh route read succeeds; it must
      // not reveal a prior invitation page or its authorization-derived controls.
      await router.invalidate({ sync: true });
    } catch {
      // The route error boundary remains visible for another explicit retry.
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section aria-labelledby="organization-invitations-error-heading" className="space-y-5">
      <div className="space-y-1">
        <h1
          id="organization-invitations-error-heading"
          className="text-3xl font-semibold tracking-tight text-white"
        >
          Organization invitations
        </h1>
      </div>
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardContent className="flex flex-wrap items-center gap-3 py-6">
          <p role="alert" className="text-sm text-slate-400">
            We could not load organization invitations. Retry the current organization invitation
            read.
          </p>
          <Button
            type="button"
            className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
            disabled={retrying}
            onClick={() => void retry()}
          >
            {retrying ? "Retrying organization invitations…" : "Retry organization invitations"}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

function OrganizationInvitationsContents({
  organizationId,
  actorProfileId,
  canInviteAdministrators,
  page,
  cursor,
}: {
  organizationId: string;
  actorProfileId: string;
  canInviteAdministrators: boolean;
  page: InvitationPage;
  cursor?: string;
}) {
  const router = useRouter();
  const current = useRef({ actorProfileId, organizationId, operation: 0 });
  const inFlight = useRef(false);
  const [selected, setSelected] = useState<Invitation | null>(null);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [uncertainCreate, setUncertainCreate] = useState(false);
  const form = useForm<InvitationDraft>({
    defaultValues: {
      kind: "staff",
      requestedRole: "coach",
      recipientEmail: "",
      expiresAt: futureLocalDateTime(),
    },
  });
  const kind = form.watch("kind");
  useEffect(() => {
    current.current = { actorProfileId, organizationId, operation: 0 };
    return () => {
      current.current.operation += 1;
    };
  }, [actorProfileId, organizationId]);
  const isCurrent = (operation: number) => current.current.operation === operation;
  const refresh = async () => {
    const operation = ++current.current.operation;
    try {
      await router.invalidate();
      if (!isCurrent(operation)) return;
      setLocked(false);
      setUncertainCreate(false);
      setError(null);
    } catch {
      if (isCurrent(operation))
        setError("Invitations could not refresh. No further changes are available until they do.");
    }
  };
  const create = async (draft: InvitationDraft) => {
    if (inFlight.current || locked || uncertainCreate) return;
    const expiresAt = new Date(draft.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      form.setError("expiresAt", { message: "Choose a future expiration date and time." });
      return;
    }
    if (draft.kind === "staff" && draft.requestedRole === "admin" && !canInviteAdministrators) {
      form.setError("requestedRole", { message: "Only the root owner can invite administrators." });
      return;
    }
    const operation = ++current.current.operation;
    inFlight.current = true;
    setError(null);
    setNotice(null);
    try {
      const result = await createOrganizationInvitation({
        data: {
          organizationId,
          kind: draft.kind,
          requestedRole: draft.kind === "staff" ? draft.requestedRole : null,
          recipientProfileId: null,
          recipientEmail: draft.recipientEmail,
          expiresAt,
        },
      });
      if (!isCurrent(operation)) return;
      if (result.status === "access_lost") {
        setLocked(true);
        setError("Your access has changed. Refresh invitations before taking another action.");
        return;
      }
      setInvitationLink(
        buildOrganizationInvitationLink(window.location.origin, result.invitation.token),
      );
      setNotice("Invitation created. Copy the invitation link now; it will not be shown again.");
      try {
        await router.invalidate();
      } catch {
        if (isCurrent(operation)) {
          setLocked(true);
          setNotice(
            "Invitation created, but the list could not refresh. Copy the invitation link now, then refresh before another change.",
          );
        }
      }
    } catch {
      if (isCurrent(operation)) {
        setUncertainCreate(true);
        setError(
          "We could not confirm whether the invitation was created. Refresh and reconcile the list before explicitly creating a new invitation. Your draft has been kept.",
        );
      }
    } finally {
      inFlight.current = false;
    }
  };
  const revoke = async () => {
    if (!selected || inFlight.current || locked) return;
    const operation = ++current.current.operation;
    inFlight.current = true;
    setError(null);
    try {
      const result = await revokeOrganizationInvitation({
        data: { organizationId, invitationId: selected.invitationId },
      });
      if (!isCurrent(operation)) return;
      if (result.status === "access_lost") {
        setLocked(true);
        setError("Your access has changed. Refresh invitations before taking another action.");
        return;
      }
      setSelected(null);
      setNotice("Invitation revoked.");
      try {
        await router.invalidate();
      } catch {
        if (isCurrent(operation)) {
          setLocked(true);
          setNotice(
            "Invitation revoked, but the list could not refresh. Refresh before another change.",
          );
        }
      }
    } catch {
      if (isCurrent(operation)) {
        setLocked(true);
        setError(
          "We could not confirm whether the invitation was revoked. Refresh invitations before another change.",
        );
      }
    } finally {
      inFlight.current = false;
    }
  };
  const copyInvitationLink = async () => {
    if (!invitationLink) return;
    // Copying is not a new mutation and must not supersede its reconciliation.
    const operation = current.current.operation;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(invitationLink);
      if (isCurrent(operation)) {
        setNotice("Invitation link copied. Keep it open until you have shared it.");
      }
    } catch {
      if (isCurrent(operation))
        setError(
          "The invitation link could not be copied. Select and copy it before dismissing this message.",
        );
    }
  };
  return (
    <section aria-labelledby="organization-invitations-heading" className="space-y-5">
      <div className="space-y-1">
        <h1
          id="organization-invitations-heading"
          className="text-3xl font-semibold tracking-tight text-white"
        >
          Organization invitations
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Create a shareable invitation link. No email is sent, and recipient identity is not shown
          in this list.
        </p>
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
      {invitationLink ? (
        <Card className="border-amber-700 bg-slate-900 text-slate-50">
          <CardHeader>
            <CardTitle>Copy invitation link</CardTitle>
            <CardDescription className="text-slate-400">
              This link is displayed once. Share it through an approved channel. No email has been
              sent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              aria-label="Invitation link"
              className="block w-full rounded bg-slate-950 p-3 text-sm"
              data-ph-no-capture
              data-sentry-mask
              readOnly
              type="text"
              value={invitationLink}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={() => void copyInvitationLink()}>
                Copy invitation link
              </Button>
              <Button type="button" variant="outline" onClick={() => setInvitationLink(null)}>
                Dismiss invitation link
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {locked || uncertainCreate ? (
        <div className="flex flex-wrap items-center gap-3" role="status">
          <p className="text-sm text-amber-200">
            Refresh invitations before making another change.
          </p>
          <Button type="button" onClick={() => void refresh()}>
            Refresh invitations
          </Button>
        </div>
      ) : null}
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Create invitation</CardTitle>
          <CardDescription className="text-slate-400">
            Use a usable email address. The person receives no message from us.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            noValidate
            onSubmit={form.handleSubmit(create)}
          >
            <label className="grid gap-1 text-sm">
              Invitation type
              <select
                className="rounded border border-slate-700 bg-slate-950 p-2"
                {...form.register("kind")}
              >
                <option value="staff">Staff</option>
                <option value="athlete">Athlete</option>
              </select>
            </label>
            {kind === "staff" ? (
              <label className="grid gap-1 text-sm">
                Staff role
                <select
                  className="rounded border border-slate-700 bg-slate-950 p-2"
                  {...form.register("requestedRole")}
                >
                  <option value="coach">Coach</option>
                  <option value="admin" disabled={!canInviteAdministrators}>
                    Administrator
                  </option>
                </select>
              </label>
            ) : (
              <p className="self-end text-sm text-slate-400">
                Athlete invitations do not include a staff role.
              </p>
            )}
            <label className="grid gap-1 text-sm sm:col-span-2">
              Recipient email
              <input
                type="email"
                autoComplete="email"
                className="rounded border border-slate-700 bg-slate-950 p-2"
                aria-invalid={form.formState.errors.recipientEmail ? true : undefined}
                {...form.register("recipientEmail", {
                  required: "Enter an email address.",
                  validate: (value) => emailPattern.test(value) || "Enter a usable email address.",
                })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Expires at
              <input
                type="datetime-local"
                className="rounded border border-slate-700 bg-slate-950 p-2"
                {...form.register("expiresAt", { required: "Choose an expiration date and time." })}
              />
            </label>
            {form.formState.errors.expiresAt?.message ? (
              <p role="alert" className="self-end text-sm text-red-300">
                {form.formState.errors.expiresAt.message}
              </p>
            ) : null}
            {form.formState.errors.recipientEmail?.message ? (
              <p role="alert" className="self-end text-sm text-red-300">
                {form.formState.errors.recipientEmail.message}
              </p>
            ) : null}
            {form.formState.errors.requestedRole?.message ? (
              <p role="alert" className="self-end text-sm text-red-300">
                {form.formState.errors.requestedRole.message}
              </p>
            ) : null}
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={locked || uncertainCreate || form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Creating invitation…" : "Create invitation"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Invitation history</CardTitle>
          <CardDescription className="text-slate-400">{page.items.length} shown</CardDescription>
        </CardHeader>
        <CardContent>
          {page.items.length ? (
            <ul aria-label="Invitation history" className="space-y-3">
              {page.items.map((invitation) => {
                const status = effectiveStatus(invitation);
                return (
                  <li
                    key={invitation.invitationId}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3 last:border-0"
                  >
                    <div>
                      <p className="font-medium capitalize">
                        {invitation.kind} invitation
                        {invitation.requestedRole ? ` · ${invitation.requestedRole}` : ""}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        Created {new Date(invitation.createdAt).toLocaleString()} · Expires{" "}
                        {new Date(invitation.expiresAt).toLocaleString()}
                      </p>
                      <Badge className="mt-2 border-slate-700 bg-slate-800 capitalize text-slate-200">
                        {status}
                      </Badge>
                    </div>
                    {status === "pending" &&
                    (invitation.requestedRole !== "admin" || canInviteAdministrators) ? (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={locked}
                        onClick={() => {
                          setError(null);
                          setSelected(invitation);
                        }}
                      >
                        Revoke invitation
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No invitations on this page.</p>
          )}
        </CardContent>
      </Card>
      <InvitationPagination
        organizationId={organizationId}
        hasMore={page.hasMore}
        nextCursor={page.nextCursor}
        {...(cursor === undefined ? {} : { cursor })}
      />
      <AlertDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !inFlight.current) setSelected(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              Revoke invitation {selected?.invitationId ?? ""}. Its current status is{" "}
              {selected ? effectiveStatus(selected) : "unknown"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={inFlight.current}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={locked}
              onClick={() => void revoke()}
            >
              Revoke invitation
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function InvitationPagination({
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
  const basePath = `/organizations/${organizationId}/invitations`;
  return (
    <nav aria-label="Invitation history pages" className="flex flex-wrap gap-3">
      {cursor ? (
        <Button asChild variant="outline">
          <a href={basePath}>First page</a>
        </Button>
      ) : null}
      {hasMore && nextCursor ? (
        <Button asChild>
          <a href={`${basePath}?cursor=${encodeURIComponent(nextCursor)}`}>Next page</a>
        </Button>
      ) : null}
    </nav>
  );
}
