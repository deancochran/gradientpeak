import type { CoachRosterEntry } from "@repo/core/coaching";
import { getProfileDisplayName, getProfileInitials } from "@repo/core/profile";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { MessageActionForm } from "../../components/protected/message-action-form";
import { api } from "../../lib/api/client";

export const Route = createFileRoute("/_protected/coaching")({
  component: CoachingPage,
});

function CoachingPage() {
  const { data: roster = [], isLoading } = api.coaching.getRoster.useQuery();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Coaching Dashboard</h1>
          <p className="text-muted-foreground">Manage your athletes and training plans.</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            Invite Athlete
          </Button>
          <p className="text-sm text-muted-foreground">Invites are not available on web yet.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>Your current athlete roster.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              Loading roster...
            </div>
          ) : roster.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              No athletes assigned yet.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Athlete</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[56px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((entry) => (
                    <RosterRow key={entry.athlete_id} entry={entry} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RosterRow({ entry }: { entry: CoachRosterEntry }) {
  const profile = entry.profile;
  const name = getProfileDisplayName(profile);
  const username = profile?.username ? `@${profile.username}` : null;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={profile?.avatar_url || ""} alt={name} />
            <AvatarFallback>{getProfileInitials(profile)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">{username ?? "No username set"}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
          Active
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link
              to="/user/$userId"
              params={{ userId: entry.athlete_id }}
              search={{ flash: undefined, flashType: undefined }}
            >
              View Profile
            </Link>
          </Button>
          <MessageActionForm redirectTo="/coaching" targetUserId={entry.athlete_id} />
        </div>
      </TableCell>
    </TableRow>
  );
}
