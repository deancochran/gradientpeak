import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { ErrorStateCard } from "@repo/ui/components/error-state-card";
import { InlineLoadingStatus } from "@repo/ui/components/loading";
import {
  ResourceCardHeader,
  ResourceCardShell,
  ResourceMetricsRow,
} from "@repo/ui/components/resource-presentation";
import { Link } from "@tanstack/react-router";
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
  viewerRsvp: { status: "going" | "declined" } | null;
  viewerSeriesRsvp: { status: "going" | "declined" } | null;
  group?: Pick<WebGroupSummary, "id" | "name" | "slug" | "avatar_url"> | null;
};

export function canRenderRemoveMemberControl(
  viewer: Pick<GroupViewer, "canRemoveMembers" | "relationshipState">,
  targetRole: "owner" | "admin" | "member",
) {
  return (
    viewer.canRemoveMembers &&
    targetRole !== "owner" &&
    (viewer.relationshipState === "owner" || targetRole === "member")
  );
}

export function GroupManagementShell({
  activeTab,
  children,
  description,
  groupId,
  heading,
  viewer,
}: {
  activeTab: "members" | "requests";
  children: ReactNode;
  description: string;
  groupId: string;
  heading: string;
  viewer: GroupViewer;
}) {
  const canManageRequests = viewer.canInvite || viewer.canManageJoinRequests;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{heading}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild type="button" variant="outline">
          <Link to="/groups/$groupId" params={{ groupId }}>
            Back to group
          </Link>
        </Button>
      </header>
      <nav aria-label="Group management" className="flex flex-wrap gap-2">
        {viewer.canViewMembers ? (
          <Button asChild variant={activeTab === "members" ? "default" : "outline"}>
            <Link
              aria-current={activeTab === "members" ? "page" : undefined}
              to="/groups/$groupId/members"
              params={{ groupId }}
            >
              Members
            </Link>
          </Button>
        ) : null}
        {canManageRequests ? (
          <Button asChild variant={activeTab === "requests" ? "default" : "outline"}>
            <Link
              aria-current={activeTab === "requests" ? "page" : undefined}
              to="/groups/$groupId/requests"
              params={{ groupId }}
            >
              Requests and invitations
            </Link>
          </Button>
        ) : null}
      </nav>
      {children}
    </>
  );
}

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
    <ResourceCardShell
      accessibilityLabel={`Open group ${group.name}`}
      contentClassName="space-y-4 p-5"
      onPress={onOpen}
      testID={`group-card-${group.id}`}
    >
      {group.cover_url ? (
        <img
          alt={`${group.name} cover`}
          className="h-32 w-full rounded-t-xl object-cover"
          src={group.cover_url}
        />
      ) : null}
      <ResourceCardHeader
        accessory={
          relationship ? (
            <Badge variant="secondary" className="capitalize">
              {relationship}
            </Badge>
          ) : null
        }
        description={`@${group.slug}`}
        leading={
          <Avatar>
            {group.avatar_url ? <AvatarImage src={group.avatar_url} /> : null}
            <AvatarFallback>{initials(group.name)}</AvatarFallback>
          </Avatar>
        }
        title={group.name}
        titleClassName="truncate text-lg"
      />
      {group.description ? (
        <p className="line-clamp-3 text-sm text-muted-foreground">{group.description}</p>
      ) : null}
      <ResourceMetricsRow
        metrics={[
          {
            label: "Visibility",
            value: group.access_level === "public" ? "Public" : "Members only",
          },
          {
            label: "Join",
            value:
              group.join_policy === "open"
                ? "Open join"
                : group.join_policy === "request_to_join"
                  ? "Request to join"
                  : "Invite only",
          },
        ]}
      />
    </ResourceCardShell>
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
    <ResourceCardShell
      accessibilityLabel={`Open group event ${event.title}`}
      contentClassName="space-y-3 p-5"
      onPress={onOpen}
      testID={`group-event-card-${event.id}`}
    >
      <ResourceCardHeader
        accessory={event.cancelled_at ? <Badge variant="destructive">Cancelled</Badge> : null}
        {...(event.group?.name !== undefined ? { description: event.group.name } : {})}
        title={event.title}
        titleClassName="text-lg"
      />
      <ResourceMetricsRow
        metrics={[
          {
            label: "Starts",
            value: Number.isNaN(startsAt.getTime()) ? event.starts_at : startsAt.toLocaleString(),
          },
          ...(event.location_name ? [{ label: "Location", value: event.location_name }] : []),
          { label: "RSVP", value: `${event.acceptedRsvpCount} going` },
        ]}
      />
    </ResourceCardShell>
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
  if (isLoading) return <InlineLoadingStatus label="Loading…" />;
  if (error) {
    return (
      <ErrorStateCard
        compact
        title="Unable to load this group information."
        retryLabel="Try again"
        {...(onRetry ? { onRetry } : {})}
      />
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
