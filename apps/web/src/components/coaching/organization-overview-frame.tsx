import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

export function OrganizationOverviewFrame({
  organizationId,
  children,
  activeTab = "overview",
}: {
  organizationId: string;
  children: React.ReactNode;
  activeTab?: OrganizationAdministrationTab;
}) {
  return (
    <div className="space-y-6">
      <OrganizationAdministrationNavigation activeTab={activeTab} organizationId={organizationId} />
      {children}
    </div>
  );
}

export function OrganizationOverviewPending({ organizationId }: { organizationId: string }) {
  return (
    <OrganizationOverviewFrame organizationId={organizationId}>
      <div aria-label="Loading organization overview" className="space-y-5" role="status">
        <div className="space-y-2">
          <div className="h-4 w-72 animate-pulse rounded bg-slate-800" />
          <div className="h-9 w-64 animate-pulse rounded bg-slate-800" />
          <div className="h-4 w-80 animate-pulse rounded bg-slate-800" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {["active-athletes", "active-staff", "unassigned", "coverage"].map((metric) => (
            <div
              className="h-32 animate-pulse rounded-lg border border-slate-700 bg-slate-900"
              key={metric}
            />
          ))}
        </div>
        <div className="h-56 animate-pulse rounded-lg border border-slate-700 bg-slate-900" />
        <span className="sr-only">Loading organization overview…</span>
      </div>
    </OrganizationOverviewFrame>
  );
}

export function OrganizationOverviewError({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } catch {
      // Keep the failure visible. A failed reread must never be presented as an empty overview.
    } finally {
      setRetrying(false);
    }
  }

  return (
    <OrganizationOverviewFrame organizationId={organizationId}>
      <Card className="mx-auto max-w-2xl border-slate-700 bg-slate-900 text-slate-50">
        <CardContent className="space-y-4 py-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Organization overview unavailable</h1>
            <p role="alert" className="text-sm text-slate-400">
              We could not load the organization overview. Please try again.
            </p>
          </div>
          <Button
            disabled={retrying}
            onClick={() => void retry()}
            className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
          >
            {retrying ? "Retrying organization overview…" : "Retry organization overview"}
          </Button>
        </CardContent>
      </Card>
    </OrganizationOverviewFrame>
  );
}

type OrganizationAdministrationTab =
  | "overview"
  | "staff"
  | "roles"
  | "athletes"
  | "assignments"
  | "invitations"
  | "groups"
  | "audit";

function OrganizationAdministrationNavigation({
  organizationId,
  activeTab,
}: {
  organizationId: string;
  activeTab: OrganizationAdministrationTab;
}) {
  const navigationClassName =
    "inline-flex shrink-0 rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2";
  const activeNavigationClassName =
    "inline-flex shrink-0 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2";
  const tabClassName = (tab: OrganizationAdministrationTab) =>
    activeTab === tab ? activeNavigationClassName : navigationClassName;

  return (
    <nav
      aria-label="Organization administration"
      className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      <Link
        to="/organizations/$organizationId/dashboard"
        params={{ organizationId }}
        aria-current={activeTab === "overview" ? "page" : undefined}
        className={tabClassName("overview")}
      >
        Overview
      </Link>
      <Link
        to="/organizations/$organizationId/staff"
        params={{ organizationId }}
        search={{ status: "active", cursor: undefined }}
        aria-current={activeTab === "staff" ? "page" : undefined}
        className={tabClassName("staff")}
      >
        Staff
      </Link>
      <Link
        to="/organizations/$organizationId/roles"
        params={{ organizationId }}
        aria-current={activeTab === "roles" ? "page" : undefined}
        className={tabClassName("roles")}
      >
        Roles
      </Link>
      <Link
        to="/organizations/$organizationId/athletes"
        params={{ organizationId }}
        aria-current={activeTab === "athletes" ? "page" : undefined}
        className={tabClassName("athletes")}
      >
        Athletes
      </Link>
      <Link
        to="/organizations/$organizationId/assignments"
        params={{ organizationId }}
        aria-current={activeTab === "assignments" ? "page" : undefined}
        className={tabClassName("assignments")}
      >
        Assignments
      </Link>
      <Link
        to="/organizations/$organizationId/invitations"
        params={{ organizationId }}
        aria-current={activeTab === "invitations" ? "page" : undefined}
        className={tabClassName("invitations")}
      >
        Invitations
      </Link>
      <Link
        to="/organizations/$organizationId/groups"
        params={{ organizationId }}
        aria-current={activeTab === "groups" ? "page" : undefined}
        className={tabClassName("groups")}
      >
        Groups
      </Link>
      <Link
        to="/organizations/$organizationId/audit"
        params={{ organizationId }}
        aria-current={activeTab === "audit" ? "page" : undefined}
        className={tabClassName("audit")}
      >
        Audit
      </Link>
    </nav>
  );
}
