import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Calendar, Circle, MessageSquare, Search, Settings, Target, Users } from "lucide-react";

export const Route = createFileRoute("/_protected/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: SearchPage,
});

const SEARCH_SECTIONS = [
  {
    description: "Open the recording launcher and related recording flows.",
    icon: Circle,
    title: "Record",
    to: "/record" as const,
  },
  {
    description: "Browse planning hubs, goals, and future training plan surfaces.",
    icon: Target,
    title: "Plan",
    to: "/plan" as const,
  },
  {
    description: "Jump into scheduled activities, day views, and event drill-ins.",
    icon: Calendar,
    title: "Calendar",
    to: "/calendar" as const,
  },
  {
    description: "Open current conversations or start messaging flows.",
    icon: MessageSquare,
    title: "Messages",
    to: "/messages" as const,
  },
  {
    description: "Open account, profile, integrations, and preferences.",
    icon: Settings,
    title: "Settings",
    to: "/settings" as const,
  },
  {
    description: "Open roster and coaching actions available on web.",
    icon: Users,
    title: "Coaching",
    to: "/coaching" as const,
  },
] as const;

function SearchPage() {
  const { q } = Route.useSearch();
  const query = q?.trim().toLowerCase() ?? "";
  const filteredSections =
    query.length === 0
      ? SEARCH_SECTIONS
      : SEARCH_SECTIONS.filter(
          (section) =>
            section.title.toLowerCase().includes(query) ||
            section.description.toLowerCase().includes(query),
        );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Badge variant="outline">Search</Badge>
        </div>
        <form method="get" action="/search" className="flex gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search routes, plans, athletes, or actions"
            className="flex h-11 w-full rounded-xl border bg-background px-4 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit">Search</Button>
        </form>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {q ? `Results for "${q}"` : "Search GradientPeak"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Search currently routes you into the main web sections while we scaffold deeper parity.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredSections.map((section) => {
          const Icon = section.icon;

          return (
            <Card key={section.to}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  {section.title}
                </CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  to={section.to}
                  {...(section.to === "/messages" ? { search: { conversationId: undefined } } : {})}
                  className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Open {section.title}
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
