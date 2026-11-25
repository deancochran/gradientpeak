import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Link, useNavigate } from "@tanstack/react-router";
import { Filter, LockKeyhole } from "lucide-react";
import { useState } from "react";

type AuditEvent = {
  eventId: string;
  occurredAt: Date;
  actor: { profileId: string; displayName: string | null; username: string | null } | null;
  action: string;
  resource: { type: string; id: string | null };
  details: "none" | "redacted";
};
type AuditPage = { items: AuditEvent[]; nextCursor: string | null; hasMore: boolean };
type Filters = {
  action?: string | undefined;
  actorProfileId?: string | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  fromInclusive?: string | undefined;
  toExclusive?: string | undefined;
};

export function OrganizationAuditHistory({
  organizationId,
  page,
  filters,
}: {
  organizationId: string;
  page: AuditPage;
  filters: Filters;
}) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [action, setAction] = useState(filters.action ?? "");
  const [actorProfileId, setActorProfileId] = useState(filters.actorProfileId ?? "");
  const [resourceType, setResourceType] = useState(filters.resourceType ?? "");
  const [resourceId, setResourceId] = useState(filters.resourceId ?? "");
  const [fromInclusive, setFromInclusive] = useState(dateInputValue(filters.fromInclusive));
  const [throughDayUtc, setThroughDayUtc] = useState(endDateInputValue(filters.toExclusive));

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    void navigate({
      to: "/organizations/$organizationId/audit",
      params: { organizationId },
      search: {
        action: action.trim() || undefined,
        actorProfileId: actorProfileId.trim() || undefined,
        resourceType: resourceType.trim() || undefined,
        resourceId: resourceId.trim() || undefined,
        fromInclusive: fromInclusive ? `${fromInclusive}T00:00:00.000Z` : undefined,
        toExclusive: throughDayUtc ? nextUtcDayStart(throughDayUtc) : undefined,
        cursor: undefined,
      },
    });
  }

  if (selected)
    return (
      <div className="space-y-6">
        <Button
          type="button"
          variant="outline"
          className="border-border bg-card text-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setSelected(null)}
        >
          Back to audit history
        </Button>
        <Card className="border-border bg-card text-foreground">
          <CardHeader>
            <CardTitle>Audit event</CardTitle>
            <CardDescription className="text-muted-foreground">
              Event metadata is shown below. Private content is never shown in audit history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Detail label="When (UTC)" value={formatDate(selected.occurredAt)} />
            <Detail label="Actor" value={actorName(selected)} />
            <Detail label="Action" value={selected.action} />
            <Detail label="Resource" value={resourceName(selected)} />
            {selected.details === "redacted" ? (
              <p className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-warning">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                Sensitive event details are restricted. You can see the action metadata but not
                private content.
              </p>
            ) : (
              <p className="text-muted-foreground">No additional safe event detail is recorded.</p>
            )}
            <p className="text-muted-foreground">
              This record does not include a discrete outcome field. Audit history does not infer
              one.
            </p>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">
          Administration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Audit history</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Review organization event metadata. Private message contents, credentials, health data,
          and arbitrary event details are not shown here.
        </p>
      </header>
      <form
        onSubmit={applyFilters}
        className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-5"
      >
        <label className="grid gap-1 text-sm text-muted-foreground">
          Action
          <input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="e.g. organization.closed"
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
          />
        </label>
        <label className="grid gap-1 text-sm text-muted-foreground">
          Actor ID
          <input
            value={actorProfileId}
            onChange={(event) => setActorProfileId(event.target.value)}
            placeholder="Profile UUID"
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
          />
        </label>
        <label className="grid gap-1 text-sm text-muted-foreground">
          Resource type
          <input
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
            placeholder="e.g. organization_membership"
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
          />
        </label>
        <label className="grid gap-1 text-sm text-muted-foreground">
          Resource ID
          <input
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
            placeholder="Resource UUID"
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground"
          />
        </label>
        <label className="grid gap-1 text-sm text-muted-foreground">
          From (UTC)
          <input
            type="date"
            value={fromInclusive}
            onChange={(event) => setFromInclusive(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <label className="grid gap-1 text-sm text-muted-foreground">
          Through day (UTC)
          <input
            type="date"
            value={throughDayUtc}
            onChange={(event) => setThroughDayUtc(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
          />
        </label>
        <div className="flex items-end">
          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
        </div>
      </form>
      <Card className="border-border bg-card text-foreground">
        <CardHeader>
          <CardTitle>Organization events</CardTitle>
          <CardDescription className="text-muted-foreground">
            Export is unavailable until a separately authorized export capability exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {page.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No audit events match the current scope.
            </p>
          ) : (
            <div className="min-w-0 md:overflow-x-auto">
              <table className="block w-full text-left text-sm md:table md:min-w-[42rem]">
                <thead className="sr-only border-b border-border text-muted-foreground md:not-sr-only md:table-header-group">
                  <tr>
                    <th className="p-3">When (UTC)</th>
                    <th className="p-3">Actor</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Resource</th>
                    <th className="p-3">
                      <span className="sr-only">View event</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="block md:table-row-group">
                  {page.items.map((item) => (
                    <tr
                      key={item.eventId}
                      className="block border-b border-border py-3 last:border-0 md:table-row md:py-0"
                    >
                      <td className="block px-3 py-1 md:table-cell md:p-3 md:whitespace-nowrap">
                        <span className="text-muted-foreground md:hidden">When (UTC): </span>
                        {formatDate(item.occurredAt)}
                      </td>
                      <td className="block break-words px-3 py-1 md:table-cell md:p-3">
                        <span className="text-muted-foreground md:hidden">Actor: </span>
                        {actorName(item)}
                      </td>
                      <td className="block break-all px-3 py-1 font-medium md:table-cell md:p-3">
                        <span className="text-muted-foreground md:hidden">Action: </span>
                        {item.action}
                      </td>
                      <td className="block break-all px-3 py-1 md:table-cell md:p-3">
                        <span className="text-muted-foreground md:hidden">Resource: </span>
                        {resourceName(item)}{" "}
                        {item.details === "redacted" ? (
                          <Badge className="ml-2 border-warning/40 bg-warning/10 text-warning">
                            Details hidden
                          </Badge>
                        ) : null}
                      </td>
                      <td className="block p-3 md:table-cell md:text-right">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
                          onClick={() => setSelected(item)}
                        >
                          View event
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {page.hasMore && page.nextCursor ? (
            <Link
              to="/organizations/$organizationId/audit"
              params={{ organizationId }}
              search={{ ...filters, cursor: page.nextCursor }}
              className="mt-4 inline-block text-sm text-primary hover:text-primary"
            >
              Next page of audit events
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      {value}
    </p>
  );
}
function actorName(event: AuditEvent) {
  return event.actor?.displayName ?? event.actor?.username ?? "No actor identity recorded";
}
function resourceName(event: AuditEvent) {
  return event.resource.id ? `${event.resource.type} · ${event.resource.id}` : event.resource.type;
}
function formatDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);
}
function dateInputValue(value: string | undefined) {
  return value?.slice(0, 10) ?? "";
}
function endDateInputValue(value: string | undefined) {
  return value ? new Date(new Date(value).getTime() - 1).toISOString().slice(0, 10) : "";
}
function nextUtcDayStart(value: string) {
  return new Date(new Date(`${value}T00:00:00.000Z`).getTime() + 86_400_000).toISOString();
}
