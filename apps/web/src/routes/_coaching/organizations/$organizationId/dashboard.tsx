import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, ClipboardCheck, Users } from "lucide-react";

export const Route = createFileRoute("/_coaching/organizations/$organizationId/dashboard")({
  component: CoachDashboardPage,
});

function CoachDashboardPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-cyan-300">Dashboard</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Coaching workspace</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          This environment is separate from the standard profile app. Athlete information will
          appear only after engagements, coach assignments, and scoped athlete consent are
          implemented and verified.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Coaching dashboard readiness">
        <ReadinessCard
          icon={<Users className="h-5 w-5" />}
          title="Profiles"
          description="Organization-authorized athlete profiles will appear here after the delegated-access foundation lands."
        />
        <ReadinessCard
          icon={<ClipboardCheck className="h-5 w-5" />}
          title="Weekly review"
          description="Readiness, completion, and exceptions remain unavailable until athlete consent is active."
        />
        <ReadinessCard
          icon={<CalendarClock className="h-5 w-5" />}
          title="Upcoming events"
          description="Calendar adjustments will require explicit assignment and audited write authority."
        />
      </section>
    </div>
  );
}

function ReadinessCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-slate-800 bg-slate-900 text-slate-50">
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-slate-800 text-cyan-300">
          {icon}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="leading-6 text-slate-400">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}
