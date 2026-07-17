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
import { LayoutDashboard, Menu } from "lucide-react";

type CoachShellProps = {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

export function CoachShell({ organization }: CoachShellProps) {
  const location = useLocation();
  const dashboardPath = `/organizations/${organization.id}/dashboard`;

  return (
    <div className="gp-protected-shell min-h-screen bg-slate-950 text-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[96rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <CoachMobileNavigation
            organizationId={organization.id}
            organizationName={organization.name}
          />
          <Link
            to="/organizations/$organizationId/dashboard"
            params={{ organizationId: organization.id }}
            className="flex min-w-0 items-center gap-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan-400 text-xs font-bold text-slate-950">
              GP
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">GradientPeak Coaching</span>
              <span className="block truncate text-xs text-slate-400">{organization.name}</span>
            </span>
          </Link>
          <Badge className="hidden border-cyan-700 bg-cyan-950 text-cyan-200 sm:inline-flex">
            Coach workspace
          </Badge>
          <nav className="ml-5 hidden items-center md:flex" aria-label="Coaching navigation">
            <Link
              to="/organizations/$organizationId/dashboard"
              params={{ organizationId: organization.id }}
              aria-current={location.pathname === dashboardPath ? "page" : undefined}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-900 hover:text-white aria-[current=page]:bg-slate-800 aria-[current=page]:text-white"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          </nav>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="ml-auto border-slate-700 bg-transparent text-slate-200 hover:bg-slate-900 hover:text-white"
          >
            <Link to="/">Standard app</Link>
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
          className="text-slate-200 hover:bg-slate-900 hover:text-white md:hidden"
          aria-label="Open coaching navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-80 max-w-[88vw] gap-0 bg-slate-950 p-0 text-slate-50">
        <SheetHeader className="border-b border-slate-800 p-4 text-left">
          <SheetTitle className="text-slate-50">GradientPeak Coaching</SheetTitle>
          <SheetDescription className="text-slate-400">{organizationName}</SheetDescription>
        </SheetHeader>
        <nav className="grid gap-1 p-3" aria-label="Mobile coaching navigation">
          <SheetClose asChild>
            <Link
              to="/organizations/$organizationId/dashboard"
              params={{ organizationId }}
              className="flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          </SheetClose>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
