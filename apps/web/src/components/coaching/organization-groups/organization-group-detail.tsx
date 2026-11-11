import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { archiveOrganizationGroup } from "../../../lib/coaching/organization-groups-server-functions";

type Group = { id: string; name: string; description: string | null; createdAt: Date };
export function OrganizationGroupDetail({
  organizationId,
  group,
  children,
}: {
  organizationId: string;
  group: Group;
  children?: ReactNode;
}) {
  const archiveGroup = useServerFn(archiveOrganizationGroup);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archived, setArchived] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const mounted = useRef(true);
  const detailKey = `${organizationId}:${group.id}`;
  const identity = useRef({ organizationId, groupId: group.id });
  const pendingKey = useRef<string | null>(null);
  if (identity.current.organizationId !== organizationId || identity.current.groupId !== group.id) {
    identity.current = { organizationId, groupId: group.id };
  }
  useEffect(() => {
    // StrictMode invokes setup/cleanup twice in development. Every live mount restores this fence.
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    // A reused detail instance is a new entity context. Old async completions must not affect it.
    if (`${identity.current.organizationId}:${identity.current.groupId}` !== detailKey) return;
    pendingKey.current = null;
    setConfirming(false);
    setError(null);
    setArchived(false);
    setIsPending(false);
  }, [detailKey]);
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
        setError("Your access changed. This group was not archived.");
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
  return (
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
                <Button disabled={isPending} onClick={archive} type="button" variant="destructive">
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
  );
}
