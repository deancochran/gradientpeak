import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/ui/components/sheet";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  Menu,
  UserRoundCheck,
  Users,
} from "lucide-react";

type CoachShellProps = {
  organization: { id: string; name: string; slug: string };
};

type ScopedDestination = {
  icon?: LucideIcon;
  label: string;
  matches: (pathname: string, organizationId: string) => boolean;
  organizationScoped: true;
  to:
    | "/organizations/$organizationId/coaching"
    | "/organizations/$organizationId/athletes"
    | "/organizations/$organizationId/assignments"
    | "/organizations/$organizationId/audit"
    | "/organizations/$organizationId/dashboard";
};
type GlobalDestination = {
  icon?: LucideIcon;
  label: string;
  matches: (pathname: string, organizationId: string) => boolean;
  organizationScoped: false;
  to: "/" | "/organizations";
};
type CoachingDestination = ScopedDestination | GlobalDestination;

const coachingDestinations: readonly CoachingDestination[] = [
  {
    label: "Assignment facts",
    organizationScoped: true,
    to: "/organizations/$organizationId/coaching",
    matches: (pathname, organizationId) => pathname === `/organizations/${organizationId}/coaching`,
  },
  {
    icon: Users,
    label: "Athletes",
    organizationScoped: true,
    to: "/organizations/$organizationId/athletes",
    matches: (pathname, organizationId) =>
      pathname.startsWith(`/organizations/${organizationId}/athletes`),
  },
  {
    icon: UserRoundCheck,
    label: "Assignments",
    organizationScoped: true,
    to: "/organizations/$organizationId/assignments",
    matches: (pathname, organizationId) =>
      pathname.startsWith(`/organizations/${organizationId}/assignments`),
  },
  {
    icon: ClipboardList,
    label: "Audit history",
    organizationScoped: true,
    to: "/organizations/$organizationId/audit",
    matches: (pathname, organizationId) =>
      pathname.startsWith(`/organizations/${organizationId}/audit`),
  },
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    organizationScoped: true,
    to: "/organizations/$organizationId/dashboard",
    matches: (pathname, organizationId) =>
      pathname === `/organizations/${organizationId}/dashboard`,
  },
  {
    icon: Building2,
    label: "Organizations",
    organizationScoped: false,
    to: "/organizations",
    matches: (pathname) => pathname === "/organizations",
  },
  {
    label: "Personal workspace",
    organizationScoped: false,
    to: "/",
    matches: (pathname) => pathname === "/",
  },
];

export function CoachShell({ organization }: CoachShellProps) {
  return (
    <div className="gp-protected-shell min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[96rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <CoachMobileNavigation
            organizationId={organization.id}
            organizationName={organization.name}
          />
          <Link
            to="/organizations/$organizationId/coaching"
            params={{ organizationId: organization.id }}
            className="flex min-w-0 items-center gap-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              GP
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">GradientPeak Coaching</span>
              <span className="block truncate text-xs text-muted-foreground">
                {organization.name}
              </span>
            </span>
          </Link>
          <Badge className="hidden border-primary/30 bg-primary/10 text-primary xl:inline-flex">
            Coach workspace
          </Badge>
          <nav className="ml-5 hidden items-center xl:flex" aria-label="Coaching navigation">
            {coachingDestinations.slice(0, -1).map((destination) => (
              <CoachingNavigationLink
                destination={destination}
                key={destination.label}
                organizationId={organization.id}
              />
            ))}
          </nav>
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link to="/">Personal workspace</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

function CoachMobileNavigation({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="xl:hidden"
          aria-label="Open coaching navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 max-w-[88vw] gap-0 p-0">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle>GradientPeak Coaching</SheetTitle>
          <SheetDescription>{organizationName}</SheetDescription>
        </SheetHeader>
        <nav className="grid gap-1 p-3" aria-label="Mobile coaching navigation">
          {coachingDestinations.map((destination) => (
            <SheetClose asChild key={destination.label}>
              <CoachingNavigationLink destination={destination} organizationId={organizationId} />
            </SheetClose>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function CoachingNavigationLink({
  destination,
  organizationId,
}: {
  destination: CoachingDestination;
  organizationId: string;
}) {
  const location = useLocation();
  const Icon = destination.icon;
  const content = (
    <>
      {Icon ? <Icon className="h-4 w-4" /> : null}
      {destination.label}
    </>
  );
  const props = {
    "aria-current": destination.matches(location.pathname, organizationId)
      ? ("page" as const)
      : undefined,
    className:
      "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-muted aria-[current=page]:text-foreground",
  };
  return destination.organizationScoped ? (
    <Link to={destination.to} params={{ organizationId }} {...props}>
      {content}
    </Link>
  ) : (
    <Link to={destination.to} {...props}>
      {content}
    </Link>
  );
}
