import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { archiveOrganizationGroup } from "../../../lib/coaching/organization-groups-server-functions";
import { OrganizationGroupAccessLossProvider } from "./organization-group-access";

type Group = { id: string; name: string; description: string | null; createdAt: Date };

export function OrganizationGroupDetailPending() {
  return (
    <p aria-label="Loading organization group" role="status" className="text-sm text-slate-400">
      Loading organization group…
    </p>
  );
}

export function OrganizationGroupDetailError() {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } catch {
      // Do not replace an unresolved group read with a local reset or stale detail.
    } finally {
      setRetrying(false);
    }
  }
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-red-300">
        Organization group could not be loaded. Retry the current organization group read.
      </p>
      <Button disabled={retrying} onClick={() => void retry()} type="button">
        {retrying ? "Retrying organization group…" : "Retry organization group"}
      </Button>
    </div>
  );
}

export function OrganizationGroupDetail({
  organizationId,
  actorProfileId = "unknown",
  group,
  children,
}: {
  organizationId: string;
  actorProfileId?: string;
  group: Group;
  children?: ReactNode;
}) {
  const archiveGroup = useServerFn(archiveOrganizationGroup);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const scopeGeneration = useRef(0);
  const scopeIdentity = useRef(`${organizationId}:${group.id}:${actorProfileId}`);
  const currentScope = useRef({ organizationId, groupId: group.id, actorProfileId, generation: 0 });
  const mountedScope = useRef(true);
  const [isPending, setIsPending] = useState(false);
  const mounted = useRef(true);
  const detailKey = `${organizationId}:${group.id}`;
  const scopeKey = `${organizationId}:${group.id}:${actorProfileId}`;
  const identity = useRef({ organizationId, groupId: group.id });
  const pendingKey = useRef<string | null>(null);
  if (identity.current.organizationId !== organizationId || identity.current.groupId !== group.id) {
    identity.current = { organizationId, groupId: group.id };
  }
  if (scopeIdentity.current !== scopeKey) {
    scopeIdentity.current = scopeKey;
    scopeGeneration.current += 1;
    currentScope.current = {
      organizationId,
      groupId: group.id,
      actorProfileId,
      generation: scopeGeneration.current,
    };
  }
  useEffect(() => {
    // StrictMode invokes setup/cleanup twice in development. Every live mount restores this fence.
    mounted.current = true;
    mountedScope.current = true;
    return () => {
      mounted.current = false;
      mountedScope.current = false;
    };
  }, []);
  useEffect(() => {
    // A reused detail instance is a new authorization scope. Old async completions must not affect it.
    if (scopeIdentity.current !== scopeKey) return;
    pendingKey.current = null;
    setConfirming(false);
    setError(null);
    setArchived(false);
    setAccessLost(false);
    setIsPending(false);
  }, [scopeKey]);
  const isCurrent = (command: { organizationId: string; groupId: string }) =>
    mounted.current &&
    identity.current.organizationId === command.organizationId &&
    identity.current.groupId === command.groupId;
  async function archive() {
    const command = { organizationId, groupId: group.id };
    const commandKey = detailKey;
    if (pendingKey.current !== null) return;
    pendingKey.current = commandKey;
    setIsPending(true);
    setError(null);
    try {
      const result = await archiveGroup({ data: command });
      if (!isCurrent(command)) return;
      if (result.status === "forbidden") {
        setAccessLost(true);
        return;
      }
      // The active-group loader correctly denies archived groups. Do not invalidate the current
      // detail route here or it replaces this durable receipt with that denied loader result.
      // Navigating Back enters the list route, whose stale-time-zero loader obtains active groups.
      setArchived(true);
      setConfirming(false);
    } catch {
      if (isCurrent(command))
        setError(
          "We could not confirm whether the group was archived. Retry only if it is still active.",
        );
    } finally {
      if (pendingKey.current === commandKey) {
        pendingKey.current = null;
        if (isCurrent(command)) setIsPending(false);
      }
    }
  }
  if (archived)
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-white">{group.name} archived</h1>
        <p className="text-sm text-slate-400">
          The group has been archived. It will not return to the active groups list.
        </p>
        <Button asChild>
          <Link to="/organizations/$organizationId/groups" params={{ organizationId }}>
            Back to groups
          </Link>
        </Button>
      </div>
    );
  if (accessLost)
    return (
      <section>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Group access required</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your access changed. Group details and assignments are no longer shown.
        </p>
      </section>
    );
  return (
    <OrganizationGroupAccessLossProvider
      value={{
        scope: currentScope.current,
        reportAccessLost: (reported) => {
          const current = currentScope.current;
          if (
            mountedScope.current &&
            reported.generation === current.generation &&
            reported.organizationId === current.organizationId &&
            reported.groupId === current.groupId &&
            reported.actorProfileId === current.actorProfileId
          )
            setAccessLost(true);
        },
      }}
    >
      <div className="space-y-6">
        <Link
          className="text-sm text-cyan-300 hover:text-cyan-200"
          to="/organizations/$organizationId/groups"
          params={{ organizationId }}
        >
          ← All organization groups
        </Link>
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{group.name}</h1>
          {group.description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{group.description}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-400">No description provided.</p>
          )}
        </header>
        <Card className="border-destructive bg-slate-950 text-slate-50">
          <CardHeader>
            <CardTitle>Archive group</CardTitle>
            <CardDescription className="text-slate-400">
              Archiving removes this group from active administration. Athlete and coach assignments
              are not edited here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {confirming ? (
              <>
                <p className="text-sm">
                  Archive <strong>{group.name}</strong>? This cannot be undone from this workspace.
                </p>
                <div className="flex gap-3">
                  <Button
                    disabled={isPending}
                    onClick={archive}
                    type="button"
                    variant="destructive"
                  >
                    {isPending ? "Archiving group…" : "Confirm archive"}
                  </Button>
                  <Button
                    disabled={isPending}
                    onClick={() => setConfirming(false)}
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <Button
                disabled={isPending}
                onClick={() => setConfirming(true)}
                type="button"
                variant="destructive"
              >
                Archive group
              </Button>
            )}
          </CardContent>
        </Card>
        {children}
      </div>
    </OrganizationGroupAccessLossProvider>
  );
}
