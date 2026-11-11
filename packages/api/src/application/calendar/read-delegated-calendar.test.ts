import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { delegatedCalendarRangeRequestSchema } from "../../contracts/delegated-calendar";
import type { withAuthorizedAthleteRead } from "../organizations/authorize-athlete-read";
import { readDelegatedCalendar } from "./read-delegated-calendar";

const ids = {
  actor: "11111111-1111-4111-8111-111111111111",
  athlete: "22222222-2222-4222-8222-222222222222",
  event: "33333333-3333-4333-8333-333333333333",
  organization: "44444444-4444-4444-8444-444444444444",
  plan: "55555555-5555-4555-8555-555555555555",
};

const request = delegatedCalendarRangeRequestSchema.parse({
  athleteProfileId: ids.athlete,
  endDateExclusive: "2026-11-10",
  limit: 1,
  organizationId: ids.organization,
  startDate: "2026-11-03",
});

describe("readDelegatedCalendar", () => {
  it("binds selected organization, calendar scope, authorization, and projection to one transaction", async () => {
    const transaction: { transaction: string } = { transaction: randomUUID() };
    let repositoryTransaction: unknown;
    let authorizedRequest: unknown;
    const authorizer = (async (input: {
      organizationId: string;
      scope: string;
      read: (transaction: { transaction: string }) => Promise<unknown>;
    }) => {
      authorizedRequest = input;
      return {
        decision: { outcome: "allow" as const },
        value: await input.read(transaction),
      };
    }) as unknown as typeof withAuthorizedAthleteRead;

    const result = await readDelegatedCalendar({
      actorProfileId: ids.actor,
      authorizer,
      db: {} as never,
      request,
      repositoryForTransaction: (receivedTransaction) => {
        repositoryTransaction = receivedTransaction;
        return {
          listScopedRange: async (receivedRequest) => {
            expect(receivedRequest).toBe(request);
            return {
              items: [
                {
                  activityCategory: "run" as const,
                  activityPlanId: ids.plan,
                  eventId: ids.event,
                  planningDate: "2026-11-03",
                  status: "scheduled" as const,
                },
              ],
              truncated: true,
            };
          },
        };
      },
    });

    expect(authorizedRequest).toMatchObject({
      athleteProfileId: ids.athlete,
      organizationId: ids.organization,
      scope: "calendar",
    });
    expect(repositoryTransaction).toBe(transaction);
    expect(result).toEqual({
      nextCursor: { eventId: ids.event, planningDate: "2026-11-03" },
      projection: {
        events: [
          {
            activityCategory: "run",
            activityPlanId: ids.plan,
            eventId: ids.event,
            planningDate: "2026-11-03",
            status: "scheduled",
          },
        ],
      },
      source: "planned_sessions",
      truncated: true,
    });
  });

  it("does not read a calendar after current selected-organization authorization denies", async () => {
    let reads = 0;
    const authorizer = (async () => ({
      decision: { outcome: "deny" as const },
    })) as unknown as typeof withAuthorizedAthleteRead;

    await expect(
      readDelegatedCalendar({
        actorProfileId: ids.actor,
        authorizer,
        db: {} as never,
        request,
        repositoryForTransaction: () => ({
          listScopedRange: async () => {
            reads++;
            return { items: [], truncated: false };
          },
        }),
      }),
    ).rejects.toMatchObject({ name: "DelegatedCalendarAccessDeniedError" });
    expect(reads).toBe(0);
  });

  it("rejects inverted, oversized, and malformed date windows before authorization", () => {
    for (const input of [
      { ...request, endDateExclusive: "2026-11-03" },
      { ...request, endDateExclusive: "2027-01-05" },
      { ...request, startDate: "2026-02-30" },
    ]) {
      expect(delegatedCalendarRangeRequestSchema.safeParse(input).success).toBe(false);
    }
  });

  it("keeps date-only range and cursor identities independent of UTC offsets and DST", () => {
    for (const [input, expected] of [
      [{ ...request, cursor: { eventId: ids.event, planningDate: "2026-11-03" } }, true],
      [{ ...request, cursor: { eventId: ids.event, planningDate: "2026-11-02" } }, false],
      [{ ...request, cursor: { eventId: ids.event, planningDate: "2026-11-10" } }, false],
      [
        // US DST starts between these date-only values; this remains a two-day
        // planning range regardless of the consumer's negative UTC offset.
        { ...request, endDateExclusive: "2026-03-10", startDate: "2026-03-08" },
        true,
      ],
    ]) {
      expect(delegatedCalendarRangeRequestSchema.safeParse(input).success).toBe(expected);
    }
  });
});
