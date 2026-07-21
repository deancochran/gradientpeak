import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import type { ReactNode } from "react";

export type WebGroupSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  access_level: "public" | "members_only";
  join_policy: "open" | "request_to_join" | "invite_only";
  viewerMembershipRole?: "owner" | "admin" | "member";
  viewer?: GroupViewer;
};

export type GroupViewer = {
  relationshipState:
    | "owner"
    | "admin"
    | "member"
    | "invited"
    | "requested"
    | "removed"
    | "non_member";
  hasPendingInvite: boolean;
  hasPendingJoinRequest: boolean;
  canViewFullGroup: boolean;
  canViewMembers: boolean;
  canViewGroupEvents: boolean;
  canJoin: boolean;
  canRequestToJoin: boolean;
  canAcceptInvite: boolean;
  canLeave: boolean;
  canEditGroup: boolean;
  canInvite: boolean;
  canManageJoinRequests: boolean;
  canManageMembers: boolean;
  canPromoteMembers: boolean;
  canDemoteAdmins: boolean;
  canRemoveMembers: boolean;
  canTransferOwnership: boolean;
  canDeleteGroup: boolean;
  canCreateGroupEvent: boolean;
};

export type GroupEventSummary = {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  location_name: string | null;
  route_id: string | null;
  activity_plan_id: string | null;
  cancelled_at: string | null;
  series_id: string | null;
  recurrence_rule: string | null;
  is_recurring_occurrence: boolean;
  is_recurring_series: boolean;
  acceptedRsvpCount: number;
  viewerRsvp: { status: "accepted" | "declined" | "tentative" } | null;
  viewerSeriesRsvp: { status: "accepted" | "declined" | "tentative" } | null;
  group?: Pick<WebGroupSummary, "id" | "name" | "slug" | "avatar_url"> | null;
};

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "G"
  );
}

function relationshipLabel(group: WebGroupSummary) {
  const relationship = group.viewer?.relationshipState ?? group.viewerMembershipRole;
  if (!relationship || relationship === "non_member") return null;
  return relationship.replace("_", " ");
}

export function GroupCard({ group, onOpen }: { group: WebGroupSummary; onOpen: () => void }) {
  const relationship = relationshipLabel(group);
  return (
    <Card>
      {group.cover_url ? (
        <img
          alt={`${group.name} cover`}
          className="h-32 w-full rounded-t-xl object-cover"
          src={group.cover_url}
        />
      ) : null}
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        <Avatar>
          {group.avatar_url ? <AvatarImage src={group.avatar_url} /> : null}
          <AvatarFallback>{initials(group.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate">{group.name}</CardTitle>
          <p className="text-sm text-muted-foreground">@{group.slug}</p>
        </div>
        {relationship ? (
          <Badge variant="secondary" className="capitalize">
            {relationship}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {group.description ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">{group.description}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {group.access_level === "public" ? "Public" : "Members only"}
          </Badge>
          <Badge variant="outline">
            {group.join_policy === "open"
              ? "Open join"
              : group.join_policy === "request_to_join"
                ? "Request to join"
                : "Invite only"}
          </Badge>
        </div>
        <Button onClick={onOpen} type="button" variant="outline">
          View group
        </Button>
      </CardContent>
    </Card>
  );
}

export function GroupEventCard({
  event,
  onOpen,
}: {
  event: GroupEventSummary;
  onOpen: () => void;
}) {
  const startsAt = new Date(event.starts_at);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            {event.group ? (
              <p className="text-sm text-muted-foreground">{event.group.name}</p>
            ) : null}
            <CardTitle>{event.title}</CardTitle>
          </div>
          {event.cancelled_at ? <Badge variant="destructive">Cancelled</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">
          {Number.isNaN(startsAt.getTime()) ? event.starts_at : startsAt.toLocaleString()}
        </p>
        {event.location_name ? (
          <p className="text-sm text-muted-foreground">{event.location_name}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">{event.acceptedRsvpCount} going</p>
        <Button onClick={onOpen} type="button" variant="outline">
          View event
        </Button>
      </CardContent>
    </Card>
  );
}

export function QueryState({
  error,
  isLoading,
  onRetry,
  children,
}: {
  error?: unknown;
  isLoading: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (isLoading)
    return (
      <p aria-live="polite" role="status">
        Loading…
      </p>
    );
  if (error) {
    return (
      <div
        className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
        role="alert"
      >
        <p>Unable to load this group information.</p>
        {onRetry ? (
          <Button onClick={onRetry} type="button" variant="outline">
            Try again
          </Button>
        ) : null}
      </div>
    );
  }
  return children;
}

export function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      {error instanceof Error ? error.message : "The action could not be completed."}
    </p>
  );
}
