"use client";

import type { CoachRosterEntry } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Plus } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/lib/api/client";
import type { Athlete } from "./columns";
import { columns } from "./columns";

export default function CoachingPage() {
  const { data: roster = [], isLoading } = api.coaching.getRoster.useQuery();
  const tableRows: Athlete[] = roster.map((row: CoachRosterEntry) => ({
    athlete_id: row.athlete_id,
    profile: row.profile,
  }));

  return (
    <div className="h-full flex-1 flex-col space-y-8 p-8 md:flex">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Coaching Dashboard</h2>
          <p className="text-muted-foreground">Manage your athletes and training plans.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" /> Invite Athlete
          </Button>
          <p className="text-sm text-muted-foreground">Invites are not available on web yet.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading roster...</p>
        </div>
      ) : (
        <DataTable data={tableRows} columns={columns} />
      )}
    </div>
  );
}
