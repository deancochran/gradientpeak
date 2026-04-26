import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
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
import {
  Calendar,
  Circle,
  Lock,
  MessageSquare,
  Search,
  Settings,
  Target,
  Users,
} from "lucide-react";

import { api } from "../../lib/api/client";

export const Route = createFileRoute("/_protected/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  component: SearchPage,
});

const QUICK_LINKS = [
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
    description: "Open current conversations or start a new message.",
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
  const query = q?.trim() ?? "";
  const normalizedQuery = query.toLowerCase();
  const filteredLinks =
    normalizedQuery.length === 0
      ? QUICK_LINKS
      : QUICK_LINKS.filter(
          (section) =>
            section.title.toLowerCase().includes(normalizedQuery) ||
            section.description.toLowerCase().includes(normalizedQuery),
        );
  const { data, isLoading } = api.social.searchUsers.useQuery({
    query: query || undefined,
    limit: 12,
  });
  const users = data?.users ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Badge variant="outline">Discover</Badge>
        </div>
        <form method="get" action="/search" className="flex gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search profiles, plans, routes, or actions"
            className="flex h-11 w-full rounded-xl border bg-background px-4 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit">Search</Button>
        </form>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {query ? `Results for "${query}"` : "Discover people and web sections"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Web discover now starts with live profile search and keeps the main product surfaces
            close by.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{query ? "Profiles" : "Suggested Profiles"}</h2>
            <p className="text-sm text-muted-foreground">
              {query
                ? "Search uses live social profile data."
                : "Start with real athlete profiles while broader discover parity lands."}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link
              to="/messages"
              search={{
                compose: true,
                composeQuery: query || undefined,
                conversationId: undefined,
                flash: undefined,
                flashType: undefined,
              }}
            >
              New Message
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Loading profiles...
              </CardContent>
            </Card>
          ) : users.length > 0 ? (
            users.map((user) => (
              <Card key={user.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-lg">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url || ""} alt={user.username ?? "User"} />
                      <AvatarFallback>
                        {(user.username ?? "GP").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate">@{user.username ?? "user"}</div>
                    </div>
                  </CardTitle>
                  <CardDescription className="flex items-center gap-2">
                    {user.is_public ? (
                      <Badge variant="secondary">Public</Badge>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Lock className="h-3.5 w-3.5" />
                        Private profile
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3">
                  <Link
                    to="/user/$userId"
                    params={{ userId: user.id }}
                    search={{ flash: undefined, flashType: undefined }}
                    className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    View profile
                  </Link>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to="/messages"
                      search={{
                        compose: true,
                        composeQuery: user.username ?? undefined,
                        conversationId: undefined,
                        flash: undefined,
                        flashType: undefined,
                      }}
                    >
                      Message
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                {query
                  ? "No profiles match that search yet."
                  : "No profiles available to suggest right now."}
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Quick Links</h2>
          <p className="text-sm text-muted-foreground">
            Fast entry points into the current web surfaces.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredLinks.map((section) => {
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
                    {...(section.to === "/messages"
                      ? {
                          search: {
                            compose: undefined,
                            composeQuery: undefined,
                            conversationId: undefined,
                            flash: undefined,
                            flashType: undefined,
                          },
                        }
                      : {})}
                    className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Open {section.title}
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
