import {
  ATHLETE_READ_ACCESS_DENIAL_REASONS,
  type AthleteReadAccessDenialReason,
} from "@repo/core/organizations";
import { describe, expect, it, vi } from "vitest";
import type { DrizzleQueryExecutor } from "../db";
import { createAthleteReadAccessRepository } from "./athlete-read-access-repository";

const actorProfileId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const athleteProfileId = "33333333-3333-4333-8333-333333333333";

function collectParameters(node: unknown, parameters: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return parameters;
  const value = node as {
    value?: unknown;
    queryChunks?: unknown[];
    constructor?: { name?: string };
  };
  if (value.constructor?.name === "Param") parameters.push(value.value);
  if (Array.isArray(value.queryChunks)) {
    for (const chunk of value.queryChunks) {
      if (typeof chunk === "string") parameters.push(chunk);
      else collectParameters(chunk, parameters);
    }
  }
  if (Array.isArray(value.value)) {
    for (const chunk of value.value) collectParameters(chunk, parameters);
  }
  return parameters;
}

function createExecutor(decision?: string) {
  let query: unknown;
  const execute = vi.fn(async (input: unknown) => {
    query = input;
    return { rows: decision === undefined ? [] : [{ decision }] };
  });
  return {
    executor: { execute } as unknown as DrizzleQueryExecutor,
    getQuery: () => query,
  };
}

describe("athlete read access repository", () => {
  it("binds the trusted actor and exact authority selectors without returning athlete data", async () => {
    const query = createExecutor("allow");
    const repository = createAthleteReadAccessRepository(query.executor);

    await expect(
      repository.evaluate({
        actorProfileId,
        organizationId,
        athleteProfileId,
        scope: "activities",
      }),
    ).resolves.toEqual({ outcome: "allow", scope: "activities" });

    expect(collectParameters(query.getQuery())).toEqual([
      actorProfileId,
      organizationId,
      athleteProfileId,
      "activities",
    ]);
  });

  it.each(
    ATHLETE_READ_ACCESS_DENIAL_REASONS,
  )("maps the internal %s database decision through the closed Core contract", async (reason: AthleteReadAccessDenialReason) => {
    const query = createExecutor(reason);
    const repository = createAthleteReadAccessRepository(query.executor);

    await expect(
      repository.evaluate({
        actorProfileId,
        organizationId,
        athleteProfileId,
        scope: "metrics",
      }),
    ).resolves.toEqual({ outcome: "deny", scope: "metrics", reason });
  });

  it("fails closed when the database omits or invents a decision", async () => {
    const missing = createAthleteReadAccessRepository(createExecutor().executor);
    const unknown = createAthleteReadAccessRepository(createExecutor("unexpected").executor);
    const input = { actorProfileId, organizationId, athleteProfileId, scope: "goals" as const };

    await expect(missing.evaluate(input)).rejects.toThrow();
    await expect(unknown.evaluate(input)).rejects.toThrow();
  });

  it("resolves an organization only through the canonical exact-scope decision", async () => {
    let query: unknown;
    const execute = vi.fn(async (input: unknown) => {
      query = input;
      return { rows: [{ organization_id: organizationId }] };
    });
    const repository = createAthleteReadAccessRepository({ execute } as never);

    await expect(
      repository.findAuthorizedOrganizationId({
        actorProfileId,
        athleteProfileId,
        scope: "metrics",
      }),
    ).resolves.toBe(organizationId);
    expect(collectParameters(query)).toEqual([
      actorProfileId,
      athleteProfileId,
      actorProfileId,
      athleteProfileId,
      "metrics",
    ]);
  });

  it("fails closed when no shared organization returns an allow decision", async () => {
    const repository = createAthleteReadAccessRepository({
      execute: vi.fn(async () => ({ rows: [] })),
    } as never);

    await expect(
      repository.findAuthorizedOrganizationId({
        actorProfileId,
        athleteProfileId,
        scope: "goals",
      }),
    ).resolves.toBeNull();
  });
});
