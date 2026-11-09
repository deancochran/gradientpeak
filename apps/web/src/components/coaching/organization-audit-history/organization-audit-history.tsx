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
  action?: string;
  actorProfileId?: string;
  resourceType?: string;
  resourceId?: string;
  fromInclusive?: string;
  toExclusive?: string;
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
          className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"
          onClick={() => setSelected(null)}
        >
          Back to audit history
        </Button>
        <Card className="border-slate-800 bg-slate-900 text-slate-50">
          <CardHeader>
            <CardTitle>Audit event</CardTitle>
            <CardDescription className="text-slate-400">
              Event metadata is shown below. Private content is never shown in audit history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Detail label="When (UTC)" value={formatDate(selected.occurredAt)} />
            <Detail label="Actor" value={actorName(selected)} />
            <Detail label="Action" value={selected.action} />
            <Detail label="Resource" value={resourceName(selected)} />
            {selected.details === "redacted" ? (
              <p className="flex gap-2 rounded-md border border-amber-800 bg-amber-950/40 p-3 text-amber-100">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                Sensitive event details are restricted. You can see the action metadata but not
                private content.
              </p>
            ) : (
              <p className="text-slate-400">No additional safe event detail is recorded.</p>
            )}
            <p className="text-slate-500">
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
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">
          Administration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Audit history</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Review organization event metadata. Private message contents, credentials, health data,
          and arbitrary event details are not shown here.
        </p>
      </header>
      <form
        onSubmit={applyFilters}
        className="grid gap-3 rounded-md border border-slate-800 bg-slate-900 p-4 md:grid-cols-5"
      >
        <label className="grid gap-1 text-sm text-slate-300">
          Action
          <input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="e.g. organization.closed"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500"
          />
        </label>
        <label className="grid gap-1 text-sm text-slate-300">
          Actor ID
          <input
            value={actorProfileId}
            onChange={(event) => setActorProfileId(event.target.value)}
            placeholder="Profile UUID"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500"
          />
        </label>
        <label className="grid gap-1 text-sm text-slate-300">
          Resource type
          <input
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
            placeholder="e.g. organization_membership"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500"
          />
        </label>
        <label className="grid gap-1 text-sm text-slate-300">
          Resource ID
          <input
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
            placeholder="Resource UUID"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500"
          />
        </label>
        <label className="grid gap-1 text-sm text-slate-300">
          From (UTC)
          <input
            type="date"
            value={fromInclusive}
            onChange={(event) => setFromInclusive(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </label>
        <label className="grid gap-1 text-sm text-slate-300">
          Through day (UTC)
          <input
            type="date"
            value={throughDayUtc}
            onChange={(event) => setThroughDayUtc(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </label>
        <div className="flex items-end">
          <Button type="submit" className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300">
            <Filter className="mr-2 h-4 w-4" />
            Filter
          </Button>
        </div>
      </form>
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Organization events</CardTitle>
          <CardDescription className="text-slate-400">
            Export is unavailable until a separately authorized export capability exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {page.items.length === 0 ? (
            <p className="text-sm text-slate-400">No audit events match the current scope.</p>
          ) : (
            <div className="min-w-0 md:overflow-x-auto">
              <table className="block w-full text-left text-sm md:table md:min-w-[42rem]">
                <thead className="sr-only border-b border-slate-800 text-slate-400 md:not-sr-only md:table-header-group">
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
                      className="block border-b border-slate-800 py-3 last:border-0 md:table-row md:py-0"
                    >
                      <td className="block px-3 py-1 md:table-cell md:p-3 md:whitespace-nowrap">
                        <span className="text-slate-400 md:hidden">When (UTC): </span>
                        {formatDate(item.occurredAt)}
                      </td>
                      <td className="block break-words px-3 py-1 md:table-cell md:p-3">
                        <span className="text-slate-400 md:hidden">Actor: </span>
                        {actorName(item)}
                      </td>
                      <td className="block break-all px-3 py-1 font-medium md:table-cell md:p-3">
                        <span className="text-slate-400 md:hidden">Action: </span>
                        {item.action}
                      </td>
                      <td className="block break-all px-3 py-1 md:table-cell md:p-3">
                        <span className="text-slate-400 md:hidden">Resource: </span>
                        {resourceName(item)}{" "}
                        {item.details === "redacted" ? (
                          <Badge className="ml-2 border-amber-800 bg-amber-950 text-amber-200">
                            Details hidden
                          </Badge>
                        ) : null}
                      </td>
                      <td className="block p-3 md:table-cell md:text-right">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-800 hover:text-white"
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
              className="mt-4 inline-block text-sm text-cyan-300 hover:text-cyan-100"
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
      <span className="text-slate-400">{label}: </span>
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
