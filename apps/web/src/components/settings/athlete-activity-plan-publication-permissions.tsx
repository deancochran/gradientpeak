import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { useState } from "react";
import { api } from "../../lib/api/client";

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "We could not update activity-plan publishing permission. Refresh to confirm its current status.";
}

function hasNotFoundCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("data" in error)) return false;
  const data = error.data;
  return typeof data === "object" && data !== null && "code" in data && data.code === "NOT_FOUND";
}

/** Athlete-owned write permission, deliberately separate from coaching read consent. */
export function AthleteActivityPlanPublicationPermissions() {
  const utils = api.useUtils();
  const options = api.coachingPublication.permissionOptions.useQuery();
  const grant = api.coachingPublication.grant.useMutation({ retry: false });
  const revoke = api.coachingPublication.revoke.useMutation({ retry: false });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = grant.isPending || revoke.isPending;

  async function refreshStatus() {
    await utils.coachingPublication.permissionOptions.invalidate();
  }

  async function setPermission(input: {
    coachMembershipId: string;
    coachName: string;
    currentGrantId: string | null;
    enabled: boolean;
    organizationId: string;
  }) {
    if (pending) return;
    setError(null);
    setMessage(null);
    try {
      if (input.enabled) {
        await grant.mutateAsync({
          organizationId: input.organizationId,
          coachMembershipId: input.coachMembershipId,
        });
        setMessage(`${input.coachName} can now publish activity plans to your plan.`);
      } else if (input.currentGrantId) {
        await revoke.mutateAsync({ grantId: input.currentGrantId });
        setMessage(`${input.coachName} can no longer publish activity plans to your plan.`);
      }
    } catch (caught) {
      if (!input.enabled && hasNotFoundCode(caught)) {
        setMessage(
          `No active activity-plan publishing permission was found for ${input.coachName}.`,
        );
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      // A retry or a lost response can leave the outcome unknown; always reload
      // the authoritative status rather than optimistically claiming a result.
      await refreshStatus();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coach activity-plan publishing</CardTitle>
        <CardDescription>
          Let an assigned coach add a copy of one of their activity plans to your training plan.
          This is a write permission, separate from any read-only coaching consent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {options.isLoading ? <p role="status">Loading assigned coaches…</p> : null}
        {options.error ? (
          <div className="space-y-2" role="alert">
            <p>Activity-plan publishing permissions could not be loaded.</p>
            <Button onClick={() => void refreshStatus()} type="button" variant="outline">
              Retry
            </Button>
          </div>
        ) : null}
        {!options.isLoading && !options.error && options.data?.options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You do not have any currently assigned coaches who can receive this permission.
          </p>
        ) : null}
        {options.data?.options.map((option) => {
          const id = `coach-activity-plan-publication-${option.coach.membershipId}`;
          const enabled = option.currentGrant !== null;
          return (
            <div
              className="flex items-center justify-between gap-4"
              key={option.coach.membershipId}
            >
              <div className="space-y-1">
                <Label htmlFor={id}>Allow {option.coach.name} to publish activity plans</Label>
                <p className="text-sm text-muted-foreground">{option.organization.name}</p>
              </div>
              <Switch
                checked={enabled}
                disabled={pending}
                id={id}
                onCheckedChange={(next) =>
                  void setPermission({
                    coachMembershipId: option.coach.membershipId,
                    coachName: option.coach.name,
                    currentGrantId: option.currentGrant?.id ?? null,
                    enabled: next,
                    organizationId: option.organization.id,
                  })
                }
              />
            </div>
          );
        })}
        {error ? <p role="alert">{error}</p> : null}
        {message ? <p role="status">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
