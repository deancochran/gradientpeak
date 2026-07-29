import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it, vi } from "vitest";
import { withAuthorizedAthleteRead } from "./authorize-athlete-read";

const input = {
  actorProfileId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
  athleteProfileId: "33333333-3333-4333-8333-333333333333",
  scope: "activities" as const,
};

function createDb(decision: string, events: string[]) {
  const transaction = {
    execute: vi.fn(async () => {
      events.push("authorize");
      return { rows: [{ decision }] };
    }),
  };
  const db = {
    transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => {
      events.push("begin");
      const result = await operation(transaction);
      events.push("commit");
      return result;
    }),
  };
  return { db: db as unknown as DrizzleDbClient, transaction };
}

describe("authorized athlete read transaction", () => {
  it("runs an allowed projection callback before the authorization transaction commits", async () => {
    const events: string[] = [];
    const fixture = createDb("allow", events);
    const read = vi.fn(async (transaction: unknown) => {
      expect(transaction).toBe(fixture.transaction);
      events.push("read");
      return { harmlessSentinel: true };
    });

    await expect(withAuthorizedAthleteRead({ ...input, db: fixture.db, read })).resolves.toEqual({
      decision: { outcome: "allow", scope: "activities" },
      value: { harmlessSentinel: true },
    });
    expect(events).toEqual(["begin", "authorize", "read", "commit"]);
  });

  it("does not invoke a projection callback after a denial", async () => {
    const events: string[] = [];
    const fixture = createDb("consent_ended", events);
    const read = vi.fn(async () => ({ shouldNotRun: true }));

    await expect(withAuthorizedAthleteRead({ ...input, db: fixture.db, read })).resolves.toEqual({
      decision: { outcome: "deny", scope: "activities", reason: "consent_ended" },
    });
    expect(read).not.toHaveBeenCalled();
    expect(events).toEqual(["begin", "authorize", "commit"]);
  });
});
