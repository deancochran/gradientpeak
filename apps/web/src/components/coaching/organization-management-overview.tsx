import { Badge } from "@repo/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";

type ManagementOverview = {
  status: "granted";
  canReadAdministrativeRoster: boolean;
  staff: {
    items: Array<{
      membershipId: string;
      identity: { profileId: string; displayName: string | null; username: string | null };
      roleKeys: Array<"admin" | "coach">;
    }>;
  } | null;
  athletes: {
    items: Array<{
      engagementId: string;
      identity: { profileId: string; displayName: string | null; username: string | null };
      status: "active" | "paused";
    }>;
  } | null;
};

export function OrganizationManagementOverview({ overview }: { overview: ManagementOverview }) {
  if (!overview.canReadAdministrativeRoster || !overview.staff || !overview.athletes) {
    return (
      <Card className="border-slate-800 bg-slate-900 text-slate-50">
        <CardHeader>
          <CardTitle>Coaching workspace</CardTitle>
          <CardDescription className="text-slate-400">
            Your current role can use coaching navigation. Administrative staff and athlete roster
            details are available only to organization administrators.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">Overview</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Organization management
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Staff and athlete enrollment are administrative records. This view does not grant access
          to private athlete training.
        </p>
      </header>
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Organization people">
        <PeopleCard
          empty="No active staff members are listed."
          heading="Staff"
          items={overview.staff.items.map((staff) => ({
            id: staff.membershipId,
            name: displayIdentity(staff.identity),
            badges: staff.roleKeys,
          }))}
        />
        <PeopleCard
          empty="No active athlete enrollments are listed."
          heading="Athletes"
          items={overview.athletes.items.map((athlete) => ({
            id: athlete.engagementId,
            name: displayIdentity(athlete.identity),
            badges: [athlete.status],
          }))}
        />
      </section>
    </div>
  );
}

function PeopleCard({
  empty,
  heading,
  items,
}: {
  empty: string;
  heading: string;
  items: Array<{ id: string; name: string; badges: string[] }>;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-50">
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
        <CardDescription className="text-slate-400">
          {items.length === 0 ? empty : `${items.length} shown`}
        </CardDescription>
      </CardHeader>
      {items.length > 0 ? (
        <CardContent>
          <ul className="space-y-3" aria-label={heading}>
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>{item.name}</span>
                <span className="flex gap-1">
                  {item.badges.map((badge) => (
                    <Badge
                      key={badge}
                      className="border-slate-700 bg-slate-800 capitalize text-slate-200"
                    >
                      {badge}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}

function displayIdentity(identity: { displayName: string | null; username: string | null }) {
  return identity.displayName ?? identity.username ?? "Organization member";
}
