import type { DrizzleDbClient } from "@repo/db/client";
import { describe, expect, it, vi } from "vitest";
import {
  withAuthorizedAthleteRead,
  withAuthorizedAthleteReadAcrossOrganizations,
  withAuthorizedAthleteReadScopes,
  withResolvedAuthorizedAthleteReadAcrossOrganizations,
} from "./authorize-athlete-read";

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
    $client: {},
    transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => {
      events.push("begin");
      const result = await operation(transaction);
      events.push("commit");
      return result;
    }),
  };
  return { db: db as unknown as DrizzleDbClient, transaction };
}

function authorizedOrganizationSelect(organizationId: string | null, events: string[]) {
  return vi.fn(() => ({
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => {
              events.push("authorize");
              return organizationId ? [{ organizationId }] : [];
            }),
          })),
        })),
      })),
    })),
  }));
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

  it("requires both activity and calendar consent before a completed-session projection reads", async () => {
    const events: string[] = [];
    const fixture = createDb("allow", events);
    fixture.transaction.execute
      .mockResolvedValueOnce({ rows: [{ decision: "allow" }] })
      .mockResolvedValueOnce({ rows: [{ decision: "consent_ended" }] });
    const read = vi.fn(async () => "must-not-run");

    await expect(
      withAuthorizedAthleteReadScopes({
        ...input,
        db: fixture.db,
        scopes: ["activities", "calendar"],
        read,
      }),
    ).resolves.toEqual({
      decision: { outcome: "deny", scope: "calendar", reason: "consent_ended" },
    });
    expect(read).not.toHaveBeenCalled();
    expect(fixture.transaction.execute).toHaveBeenCalledTimes(2);
  });

  it("keeps any-organization consent resolution and the protected read in one transaction", async () => {
    const events: string[] = [];
    const transaction = {
      selectDistinct: authorizedOrganizationSelect(input.organizationId, events),
      execute: vi.fn(async () => {
        events.push("authorize");
        return { rows: [{ organization_id: input.organizationId }] };
      }),
    };
    const db = {
      $client: {},
      transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => {
        events.push("begin");
        const result = await operation(transaction);
        events.push("commit");
        return result;
      }),
    } as unknown as DrizzleDbClient;
    const read = vi.fn(async () => {
      events.push("read");
      return "published-state";
    });

    await expect(
      withAuthorizedAthleteReadAcrossOrganizations({
        db,
        actorProfileId: input.actorProfileId,
        athleteProfileId: input.athleteProfileId,
        scope: "metrics",
        read,
      }),
    ).resolves.toEqual({
      outcome: "allow",
      organizationId: input.organizationId,
      value: "published-state",
    });
    expect(events).toEqual(["begin", "authorize", "read", "commit"]);
  });

  it("does not read athlete data when no organization has valid scoped consent", async () => {
    const transaction = {
      selectDistinct: authorizedOrganizationSelect(null, []),
      execute: vi.fn(async () => ({ rows: [] })),
    };
    const db = {
      $client: {},
      transaction: vi.fn((operation: (value: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    } as unknown as DrizzleDbClient;
    const read = vi.fn(async () => "must-not-run");

    await expect(
      withAuthorizedAthleteReadAcrossOrganizations({
        db,
        actorProfileId: input.actorProfileId,
        athleteProfileId: input.athleteProfileId,
        scope: "goals",
        read,
      }),
    ).resolves.toEqual({ outcome: "deny" });
    expect(read).not.toHaveBeenCalled();
  });

  it("resolves opaque ownership, authorizes, and reads the full resource in one transaction", async () => {
    const events: string[] = [];
    const transaction = {
      selectDistinct: authorizedOrganizationSelect(input.organizationId, events),
      execute: vi.fn(async () => {
        events.push("authorize");
        return { rows: [{ organization_id: input.organizationId }] };
      }),
    };
    const db = {
      $client: {},
      transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => {
        events.push("begin");
        const result = await operation(transaction);
        events.push("commit");
        return result;
      }),
    } as unknown as DrizzleDbClient;
    const resolveAthleteProfileId = vi.fn(async () => {
      events.push("resolve-owner");
      return input.athleteProfileId;
    });
    const read = vi.fn(async () => {
      events.push("full-goal-read");
      return "assessment";
    });

    await expect(
      withResolvedAuthorizedAthleteReadAcrossOrganizations({
        db,
        actorProfileId: input.actorProfileId,
        scope: "goals",
        resolveAthleteProfileId,
        read,
      }),
    ).resolves.toEqual({
      outcome: "allow",
      athleteProfileId: input.athleteProfileId,
      organizationId: input.organizationId,
      value: "assessment",
    });
    expect(events).toEqual(["begin", "resolve-owner", "authorize", "full-goal-read", "commit"]);
  });

  it("never performs the full resource read after resolved ownership is denied", async () => {
    const events: string[] = [];
    const transaction = {
      selectDistinct: authorizedOrganizationSelect(null, events),
      execute: vi.fn(async () => {
        events.push("authorize");
        return { rows: [] };
      }),
    };
    const db = {
      $client: {},
      transaction: vi.fn(async (operation: (value: typeof transaction) => Promise<unknown>) => {
        events.push("begin");
        const result = await operation(transaction);
        events.push("commit");
        return result;
      }),
    } as unknown as DrizzleDbClient;
    const read = vi.fn(async () => "must-not-run");

    await expect(
      withResolvedAuthorizedAthleteReadAcrossOrganizations({
        db,
        actorProfileId: input.actorProfileId,
        scope: "goals",
        resolveAthleteProfileId: async () => {
          events.push("resolve-owner");
          return input.athleteProfileId;
        },
        read,
      }),
    ).resolves.toEqual({ outcome: "deny", athleteProfileId: input.athleteProfileId });
    expect(read).not.toHaveBeenCalled();
    expect(events).toEqual(["begin", "resolve-owner", "authorize", "commit"]);
  });
});
