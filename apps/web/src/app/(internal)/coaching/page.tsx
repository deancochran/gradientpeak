"use client";

import type { CoachRosterEntry } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { trpc } from "@/lib/trpc/client";
import type { Athlete } from "./columns";
import { columns } from "./columns";

export default function CoachingPage() {
  const { data: roster = [], isLoading } = trpc.coaching.getRoster.useQuery();
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
        <div className="flex items-center space-x-2">
          <Button asChild>
            <Link href="/coaching/invite">
              <Plus className="mr-2 h-4 w-4" /> Invite Athlete
            </Link>
          </Button>
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
