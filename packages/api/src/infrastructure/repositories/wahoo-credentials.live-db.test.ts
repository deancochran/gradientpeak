import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { integrationCredentials, integrations, profiles, users } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWahooCredentials } from "../../lib/integrations/wahoo/credentials";
import { encryptProviderToken } from "../../lib/provider-token-crypto";
import { createProviderSyncRepository } from "./drizzle-provider-sync-repository";
import { createWahooRepository } from "./drizzle-wahoo-repository";

const userIds: string[] = [];
const testKey = Buffer.alloc(32, 7).toString("base64");

async function seedWahooCredentials(
  input: { accessToken?: string; legacy?: boolean; refreshToken?: string } = {},
) {
  const userId = randomUUID();
  const integrationId = randomUUID();
  const now = new Date();
  userIds.push(userId);
  await db.insert(users).values({
    id: userId,
    email: `${userId}@gradientpeak.test`,
    emailVerified: true,
    name: "Wahoo credential CAS test",
  });
  await db.insert(profiles).values({
    created_at: now,
    email: `${userId}@gradientpeak.test`,
    id: userId,
    is_public: false,
    updated_at: now,
  });
  await db.insert(integrations).values({
    created_at: now,
    external_id: `wahoo-${userId}`,
    id: integrationId,
    profile_id: userId,
    provider: "wahoo",
    updated_at: now,
  });
  await db.insert(integrationCredentials).values({
    access_token: input.legacy
      ? (input.accessToken ?? "access-1")
      : encryptProviderToken(input.accessToken ?? "access-1"),
    expires_at: new Date(Date.now() - 60_000),
    integration_id: integrationId,
    refresh_token: input.legacy
      ? (input.refreshToken ?? "refresh-1")
      : encryptProviderToken(input.refreshToken ?? "refresh-1"),
  });
  return { integrationId, profileId: userId };
}

beforeEach(() => {
  vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", testKey);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    userIds.splice(0).map((userId) => db.delete(users).where(eq(users.id, userId))),
  );
});

afterAll(async () => {
  await pool.end();
});

describe("Wahoo credential PostgreSQL CAS", () => {
  it("keeps the lifecycle generation stable across consecutive rotating refreshes and exposes only the latest tokens", async () => {
    const owner = await seedWahooCredentials();
    const repository = createWahooRepository({ db });
    const refresh = async (
      integration: NonNullable<
        Awaited<ReturnType<typeof repository.findWahooIntegrationByProfileId>>
      >,
      accessToken: string,
      refreshToken: string,
    ) =>
      resolveWahooCredentials({
        integration: { ...integration, expiresAt: "2026-07-24T15:00:00.000Z" },
        now: Date.parse("2026-07-24T15:01:00.000Z"),
        persistTokens: (tokens) =>
          repository.updateWahooIntegrationTokens({
            ...tokens,
            expectedCredentialGeneration: tokens.credentialGeneration!,
            expectedIntegrationGeneration: tokens.integrationGeneration!,
          }),
        readCurrentCredentials: () => repository.findWahooIntegrationByProfileId(owner.profileId),
        refreshAccessToken: vi.fn().mockResolvedValue({
          accessToken,
          expiresAt: "2026-07-24T16:00:00.000Z",
          refreshToken,
        }),
      });
    const first = await repository.findWahooIntegrationByProfileId(owner.profileId);
    if (!first) throw new Error("Expected Wahoo integration");
    await expect(refresh(first, "access-2", "refresh-2")).resolves.toMatchObject({
      credentialGeneration: 2,
    });
    const second = await repository.findWahooIntegrationByProfileId(owner.profileId);
    if (!second) throw new Error("Expected Wahoo integration");
    await expect(refresh(second, "access-3", "refresh-3")).resolves.toMatchObject({
      credentialGeneration: 3,
    });
    await expect(
      repository.findWahooIntegrationByProfileId(owner.profileId),
    ).resolves.toMatchObject({
      accessToken: "access-3",
      credentialGeneration: 3,
      integrationGeneration: 1,
      refreshToken: "refresh-3",
    });
  });

  it("fences refresh persistence both when disconnect wins and after a refresh commits", async () => {
    const disconnectFirst = await seedWahooCredentials();
    const refreshFirst = await seedWahooCredentials();
    const credentials = createWahooRepository({ db });
    const lifecycle = createProviderSyncRepository({ db });
    const staleDisconnectFirst = await credentials.findWahooIntegrationByProfileId(
      disconnectFirst.profileId,
    );
    const staleRefreshFirst = await credentials.findWahooIntegrationByProfileId(
      refreshFirst.profileId,
    );
    if (!staleDisconnectFirst || !staleRefreshFirst) throw new Error("Expected Wahoo integrations");

    await lifecycle.requestWahooDisconnect({ profileId: disconnectFirst.profileId });
    await expect(
      credentials.updateWahooIntegrationTokens({
        accessToken: "must-not-persist",
        expectedCredentialGeneration: staleDisconnectFirst.credentialGeneration,
        expectedIntegrationGeneration: staleDisconnectFirst.integrationGeneration,
        expiresAt: null,
        id: staleDisconnectFirst.id,
        refreshToken: "must-not-persist",
      }),
    ).resolves.toBeNull();

    await expect(
      credentials.updateWahooIntegrationTokens({
        accessToken: "committed-before-disconnect",
        expectedCredentialGeneration: staleRefreshFirst.credentialGeneration,
        expectedIntegrationGeneration: staleRefreshFirst.integrationGeneration,
        expiresAt: null,
        id: staleRefreshFirst.id,
        refreshToken: "committed-refresh",
      }),
    ).resolves.toBe(2);
    await lifecycle.requestWahooDisconnect({ profileId: refreshFirst.profileId });
    await expect(
      credentials.updateWahooIntegrationTokens({
        accessToken: "late-refresh",
        expectedCredentialGeneration: 2,
        expectedIntegrationGeneration: staleRefreshFirst.integrationGeneration,
        expiresAt: null,
        id: staleRefreshFirst.id,
        refreshToken: "late-refresh",
      }),
    ).resolves.toBeNull();
    await expect(
      credentials.findWahooIntegrationByProfileId(refreshFirst.profileId),
    ).resolves.toBeNull();
  });

  it("allows one concurrent rotating refresh, returns its incremented generation, and rereads its winner", async () => {
    const owner = await seedWahooCredentials();
    const repository = createWahooRepository({ db });
    const current = await repository.findWahooIntegrationByProfileId(owner.profileId);
    if (!current) throw new Error("Expected Wahoo integration");

    const results = await Promise.all([
      repository.updateWahooIntegrationTokens({
        accessToken: "access-a",
        expectedCredentialGeneration: current.credentialGeneration,
        expectedIntegrationGeneration: current.integrationGeneration,
        expiresAt: "2026-07-24T16:00:00.000Z",
        id: owner.integrationId,
        refreshToken: "refresh-a",
      }),
      repository.updateWahooIntegrationTokens({
        accessToken: "access-b",
        expectedCredentialGeneration: current.credentialGeneration,
        expectedIntegrationGeneration: current.integrationGeneration,
        expiresAt: "2026-07-24T16:00:00.000Z",
        id: owner.integrationId,
        refreshToken: "refresh-b",
      }),
    ]);

    const winnerGeneration = results.find((result): result is number => result !== null);
    expect(winnerGeneration).toBe(2);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    const winner = await repository.findWahooIntegrationByProfileId(owner.profileId);
    expect(winner).toMatchObject({ credentialGeneration: 2, integrationGeneration: 1 });
    expect(["access-a", "access-b"]).toContain(winner?.accessToken);
    expect(winner?.refreshToken).toBe(
      winner?.accessToken === "access-a" ? "refresh-a" : "refresh-b",
    );
  });

  it("fences a rekey racing a refresh and preserves the reread winner", async () => {
    const owner = await seedWahooCredentials({ legacy: true });
    const repository = createWahooRepository({ db });

    const [observed, refreshGeneration] = await Promise.all([
      repository.findWahooIntegrationByProfileId(owner.profileId),
      repository.updateWahooIntegrationTokens({
        accessToken: "refreshed-access",
        expectedCredentialGeneration: 1,
        expectedIntegrationGeneration: 1,
        expiresAt: "2026-07-24T16:00:00.000Z",
        id: owner.integrationId,
        refreshToken: "refreshed-refresh",
      }),
    ]);

    expect(observed?.credentialGeneration).toBeGreaterThanOrEqual(1);
    expect(refreshGeneration === 2 || refreshGeneration === null).toBe(true);
    const winner = await repository.findWahooIntegrationByProfileId(owner.profileId);
    expect(winner?.credentialGeneration).toBe(2);
    expect(["access-1", "refreshed-access"]).toContain(winner?.accessToken);
    expect(winner?.refreshToken).toBe(
      winner?.accessToken === "refreshed-access" ? "refreshed-refresh" : "refresh-1",
    );
  });

  it("does not let a stale legacy rekey restore either of two rotated refresh tokens", async () => {
    const owner = await seedWahooCredentials({ legacy: true });
    const repository = createWahooRepository({ db });
    const observed = await repository.findWahooIntegrationByProfileId(owner.profileId);
    if (!observed) throw new Error("Expected Wahoo integration");
    // Reading legacy credentials rekeys them to generation 2. A stale rekey snapshot
    // from generation 1 must lose after each successive rotation.
    await expect(
      repository.updateWahooIntegrationTokens({
        accessToken: "access-2",
        expectedCredentialGeneration: observed.credentialGeneration,
        expectedIntegrationGeneration: observed.integrationGeneration,
        expiresAt: null,
        id: observed.id,
        refreshToken: "refresh-2",
      }),
    ).resolves.toBe(3);
    await expect(
      repository.updateWahooIntegrationTokens({
        accessToken: "access-3",
        expectedCredentialGeneration: 3,
        expectedIntegrationGeneration: observed.integrationGeneration,
        expiresAt: null,
        id: observed.id,
        refreshToken: "refresh-3",
      }),
    ).resolves.toBe(4);
    await expect(
      repository.updateWahooIntegrationTokens({
        accessToken: "legacy-access",
        expectedCredentialGeneration: 1,
        expectedIntegrationGeneration: observed.integrationGeneration,
        expiresAt: null,
        id: observed.id,
        refreshToken: "refresh-1",
      }),
    ).resolves.toBeNull();
    await expect(
      repository.findWahooIntegrationByProfileId(owner.profileId),
    ).resolves.toMatchObject({
      accessToken: "access-3",
      credentialGeneration: 4,
      refreshToken: "refresh-3",
    });
  });

  it("does not let a stale refresh revive a reconnect-required credential", async () => {
    const owner = await seedWahooCredentials();
    const repository = createWahooRepository({ db });
    const current = await repository.findWahooIntegrationByProfileId(owner.profileId);
    if (!current) throw new Error("Expected Wahoo integration");

    await expect(
      repository.markWahooReconnectRequired({
        expectedCredentialGeneration: current.credentialGeneration,
        expectedIntegrationGeneration: current.integrationGeneration,
        id: owner.integrationId,
      }),
    ).resolves.toBe(true);
    await expect(
      repository.updateWahooIntegrationTokens({
        accessToken: "stale-access",
        expectedCredentialGeneration: current.credentialGeneration,
        expectedIntegrationGeneration: current.integrationGeneration,
        expiresAt: "2026-07-24T16:00:00.000Z",
        id: owner.integrationId,
        refreshToken: "stale-refresh",
      }),
    ).resolves.toBeNull();

    await expect(
      repository.findWahooIntegrationByProfileId(owner.profileId),
    ).resolves.toMatchObject({
      accessToken: "access-1",
      credentialGeneration: 2,
      reconnectRequiredAt: expect.any(String),
      refreshToken: "refresh-1",
    });
  });

  it("does not let a stale reconnect-required mark override a later refresh", async () => {
    const owner = await seedWahooCredentials();
    const repository = createWahooRepository({ db });
    const stale = await repository.findWahooIntegrationByProfileId(owner.profileId);
    if (!stale) throw new Error("Expected Wahoo integration");
    await expect(
      repository.updateWahooIntegrationTokens({
        accessToken: "fresh-access",
        expectedCredentialGeneration: stale.credentialGeneration,
        expectedIntegrationGeneration: stale.integrationGeneration,
        expiresAt: null,
        id: stale.id,
        refreshToken: "fresh-refresh",
      }),
    ).resolves.toBe(2);
    await expect(
      repository.markWahooReconnectRequired({
        expectedCredentialGeneration: stale.credentialGeneration,
        expectedIntegrationGeneration: stale.integrationGeneration,
        id: stale.id,
      }),
    ).resolves.toBe(false);
    await expect(
      repository.findWahooIntegrationByProfileId(owner.profileId),
    ).resolves.toMatchObject({
      accessToken: "fresh-access",
      credentialGeneration: 2,
      reconnectRequiredAt: null,
      refreshToken: "fresh-refresh",
    });
  });
});
