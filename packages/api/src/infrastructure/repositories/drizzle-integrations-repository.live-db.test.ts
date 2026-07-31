import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import { integrationCredentials, integrations, profiles, users } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptProviderToken } from "../../lib/provider-token-crypto";
import { createIntegrationsRepositories } from "./drizzle-integrations-repository";

const testKey = Buffer.alloc(32, 7).toString("base64");
const userIds: string[] = [];

async function seedCredentials(input: { accessToken: string; refreshToken: string | null }) {
  const profileId = randomUUID();
  const integrationId = randomUUID();
  const now = new Date();
  userIds.push(profileId);
  await db.insert(users).values({
    email: `${profileId}@gradientpeak.test`,
    emailVerified: true,
    id: profileId,
    name: "Integration credential envelope test",
  });
  await db.insert(profiles).values({
    created_at: now,
    email: `${profileId}@gradientpeak.test`,
    id: profileId,
    is_public: false,
    updated_at: now,
  });
  await db.insert(integrations).values({
    created_at: now,
    external_id: `wahoo-${profileId}`,
    id: integrationId,
    profile_id: profileId,
    provider: "wahoo",
    updated_at: now,
  });
  await db.insert(integrationCredentials).values({
    access_token: input.accessToken,
    integration_id: integrationId,
    refresh_token: input.refreshToken,
  });
  return { integrationId, profileId };
}

beforeEach(() => {
  vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", testKey);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(userIds.splice(0).map((id) => db.delete(users).where(eq(users.id, id))));
});

afterAll(async () => {
  await pool.end();
});

describe("Drizzle integrations credential reads", () => {
  it("rejects plaintext credentials without rewriting them", async () => {
    const owner = await seedCredentials({
      accessToken: "legacy-access",
      refreshToken: "legacy-refresh",
    });
    const repository = createIntegrationsRepositories(db);

    await expect(
      repository.integrations.findCredentialsByProfileIdAndProvider({
        profileId: owner.profileId,
        provider: "wahoo",
      }),
    ).rejects.toThrow("Provider credential must use the encrypted envelope");

    await expect(
      db
        .select({
          accessToken: integrationCredentials.access_token,
          generation: integrationCredentials.generation,
          refreshToken: integrationCredentials.refresh_token,
        })
        .from(integrationCredentials)
        .where(eq(integrationCredentials.integration_id, owner.integrationId)),
    ).resolves.toEqual([
      { accessToken: "legacy-access", generation: 1, refreshToken: "legacy-refresh" },
    ]);
  });

  it("decrypts current encrypted credential envelopes without changing generation", async () => {
    const owner = await seedCredentials({
      accessToken: encryptProviderToken("access-token"),
      refreshToken: encryptProviderToken("refresh-token"),
    });
    const repository = createIntegrationsRepositories(db);

    await expect(
      repository.integrations.findCredentialsByProfileIdAndProvider({
        profileId: owner.profileId,
        provider: "wahoo",
      }),
    ).resolves.toMatchObject({
      access_token: "access-token",
      generation: 1,
      refresh_token: "refresh-token",
    });
  });
});
