import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  integrationCredentials,
  integrations,
  profiles,
  providerSyncJobs,
  users,
} from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveGarminCredentials } from "../application/integrations/garmin-credentials";
import { requireProviderDisconnectionRuntime } from "../application/integrations/provider-runtime-registry";
import { GarminOAuthError } from "../lib/integrations/garmin/oauth";
import { decryptProviderToken, encryptProviderToken } from "../lib/provider-token-crypto";
import { createGarminCredentialRepository } from "./garmin-credential-repository";
import { createGarminLifecycleRepository } from "./garmin-lifecycle-repository";

const ids: string[] = [];
const credentials = createGarminCredentialRepository(db);
const lifecycle = createGarminLifecycleRepository(db);

beforeEach(() => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(url.hostname))
    throw new Error("Garmin tests require a local database");
  vi.stubEnv("PROVIDER_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
});
afterEach(async () => {
  for (const id of ids.splice(0)) await db.delete(users).where(eq(users.id, id));
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(() => pool.end());

async function seed(options: { missingCredentials?: boolean; fresh?: boolean } = {}) {
  const profileId = randomUUID();
  const integrationId = randomUUID();
  ids.push(profileId);
  await db.insert(users).values({
    id: profileId,
    email: `${profileId}@gradientpeak.test`,
    emailVerified: true,
    name: "Garmin lifecycle test",
  });
  await db
    .insert(profiles)
    .values({ id: profileId, email: `${profileId}@gradientpeak.test`, is_public: false });
  await db.insert(integrations).values({
    id: integrationId,
    profile_id: profileId,
    provider: "garmin",
    external_id: `test-${profileId}`,
  });
  if (!options.missingCredentials)
    await db.insert(integrationCredentials).values({
      integration_id: integrationId,
      access_token: encryptProviderToken("access-original"),
      refresh_token: encryptProviderToken("refresh-original"),
      expires_at: new Date(Date.now() + (options.fresh ? 3_600_000 : -60_000)),
    });
  return { profileId, integrationId };
}
async function stored(id: string) {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.integration_id, id));
  return row;
}

describe("Garmin durable credentials and disconnect (local PostgreSQL)", () => {
  it("allows recovery from a definite client/configuration rejection without revoking the grant", async () => {
    const owner = await seed();
    const refresh = vi.fn().mockRejectedValue(new GarminOAuthError("configuration_unavailable"));
    await expect(
      resolveGarminCredentials({ profileId: owner.profileId, repository: credentials, refresh }),
    ).rejects.toMatchObject({ disposition: "retry" });
    expect((await stored(owner.integrationId))?.reconnect_required_at).toBeNull();
    expect((await credentials.claim(owner.profileId)).kind).toBe("refresh");
  });
  it("allows cleanup without connection callback configuration and refreshes a server-rejected token on retry", async () => {
    const owner = await seed({ fresh: true });
    vi.stubEnv("OAUTH_CALLBACK_BASE_URL", "");
    vi.stubEnv("GARMIN_CLIENT_ID", "test-client");
    vi.stubEnv("GARMIN_CLIENT_SECRET", "test-secret");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "renewed",
            refresh_token: "rotated",
            expires_in: 3600,
            refresh_token_expires_in: 86400,
            token_type: "bearer",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const runtime = requireProviderDisconnectionRuntime("garmin");
    await expect(runtime.disconnect({ db, profileId: owner.profileId })).rejects.toThrow(
      "removal is not confirmed",
    );
    expect((await stored(owner.integrationId))?.expires_at).toEqual(new Date(0));
    await expect(runtime.disconnect({ db, profileId: owner.profileId })).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(fetch.mock.calls[2]?.[1]?.headers).toMatchObject({ Authorization: "Bearer renewed" });
    expect(await stored(owner.integrationId)).toBeUndefined();
  });

  it("keeps credentials and pending recovery available when a DELETE acknowledgement is lost or its outcome is unknown", async () => {
    const owner = await seed({ fresh: true });
    vi.stubEnv("OAUTH_CALLBACK_BASE_URL", "");
    vi.stubEnv("GARMIN_CLIENT_ID", "test-client");
    vi.stubEnv("GARMIN_CLIENT_SECRET", "test-secret");
    const fetch = vi
      .spyOn(globalThis, "fetch")
      // Garmin may have accepted this DELETE before the response was lost. The
      // protocol gives us no confirmation endpoint, so this remains unknown.
      .mockRejectedValueOnce(new TypeError("connection closed after request"))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "renewed-after-401",
            refresh_token: "rotated-after-401",
            expires_in: 3600,
            refresh_token_expires_in: 86400,
            token_type: "bearer",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const runtime = requireProviderDisconnectionRuntime("garmin");

    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(runtime.disconnect({ db, profileId: owner.profileId })).rejects.toMatchObject({
        message:
          "Garmin removal is not confirmed. Retry disconnect; if it remains pending, check connected apps in Garmin Connect.",
      });
      const [integration] = await db
        .select()
        .from(integrations)
        .where(eq(integrations.id, owner.integrationId));
      expect(integration?.lifecycle_status).toBe("disconnect_pending");
      expect(await stored(owner.integrationId)).toBeDefined();
    }

    // A 401 requests a fresh token on the next retry, but neither 401 nor 404
    // is treated as proof that Garmin removed the registration.
    expect(fetch).toHaveBeenCalledTimes(5);
    expect((await stored(owner.integrationId))?.expires_at).toEqual(new Date(0));
  });

  it("does not finalize local cleanup when Garmin accepted DELETE but the finalization lease expired", async () => {
    const owner = await seed({ fresh: true });
    vi.stubEnv("OAUTH_CALLBACK_BASE_URL", "");
    vi.stubEnv("GARMIN_CLIENT_ID", "test-client");
    vi.stubEnv("GARMIN_CLIENT_SECRET", "test-secret");
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () => {
      // Fault injection: the remote DELETE returns success, but this process
      // loses its durable finalization lease before it can apply local cleanup.
      await db
        .update(providerSyncJobs)
        .set({ lock_expires_at: new Date(0) })
        .where(eq(providerSyncJobs.integration_id, owner.integrationId));
      return new Response(null, { status: 204 });
    });
    const runtime = requireProviderDisconnectionRuntime("garmin");

    await expect(runtime.disconnect({ db, profileId: owner.profileId })).rejects.toThrow(
      "removal is not confirmed",
    );
    const [integration] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, owner.integrationId));
    expect(integration?.lifecycle_status).toBe("disconnect_pending");
    expect(await stored(owner.integrationId)).toBeDefined();
    const [job] = await db
      .select()
      .from(providerSyncJobs)
      .where(eq(providerSyncJobs.integration_id, owner.integrationId));
    expect(job?.status).toBe("failed");
    expect(job?.last_error).toBe("remote_removal_unconfirmed");
  });

  it("keeps pending consent and a committed recovery marker after uncertain refresh", async () => {
    const owner = await seed();
    const pending = await lifecycle.beginDisconnect(owner.profileId);
    if (pending.disposition !== "ready") throw new Error("Expected pending disconnect");
    await lifecycle.failDisconnect(pending);
    const refresh = vi.fn().mockRejectedValue(new GarminOAuthError("request_timeout"));
    await expect(
      resolveGarminCredentials({ profileId: owner.profileId, repository: credentials, refresh }),
    ).rejects.toMatchObject({ disposition: "disconnect_pending" });
    expect((await stored(owner.integrationId))?.reconnect_required_at).toBeInstanceOf(Date);
    await expect(
      resolveGarminCredentials({ profileId: owner.profileId, repository: credentials, refresh }),
    ).rejects.toMatchObject({ disposition: "disconnect_pending" });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("serializes disconnect attempts and retains pending state for an explicit retry", async () => {
    const owner = await seed({ fresh: true });
    const first = await lifecycle.beginDisconnect(owner.profileId);
    if (first.disposition !== "ready") throw new Error("Expected pending disconnect");
    await expect(lifecycle.beginDisconnect(owner.profileId)).rejects.toThrow("already in progress");
    await lifecycle.failDisconnect(first);
    const [pending] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, owner.integrationId));
    expect(pending?.lifecycle_status).toBe("disconnect_pending");
    const retry = await lifecycle.beginDisconnect(owner.profileId);
    if (retry.disposition !== "ready") throw new Error("Expected retry");
    expect(retry.generation).toBe(first.generation);
    expect(retry.jobId).not.toBe(first.jobId);
    expect(await lifecycle.finalizeDisconnect(first)).toBe(false);
    expect(await lifecycle.finalizeDisconnect(retry)).toBe(true);
  });
  it("allows only one concurrent redemption claim and atomically installs the rotated pair", async () => {
    const owner = await seed();
    const results = await Promise.all([
      credentials.claim(owner.profileId),
      credentials.claim(owner.profileId),
    ]);
    expect(results.map((r) => r.kind).sort()).toEqual(["busy", "refresh"]);
    const claimed = results.find((r) => r.kind === "refresh");
    if (claimed?.kind !== "refresh") throw new Error("Expected refresh claim");
    expect(
      await credentials.finish(claimed.claim, {
        kind: "success",
        accessToken: "access-new",
        refreshToken: "refresh-new",
        expiresAt: new Date(Date.now() + 3_600_000),
      }),
    ).toBe(true);
    expect(await credentials.claim(owner.profileId)).toEqual({
      kind: "ready",
      accessToken: "access-new",
    });
    const row = await stored(owner.integrationId);
    expect(row?.generation).toBe(2);
    expect(decryptProviderToken(row?.refresh_token ?? "")).toBe("refresh-new");
    expect(await credentials.finish(claimed.claim, { kind: "failed", reconnect: true })).toBe(
      false,
    );
    expect((await stored(owner.integrationId))?.reconnect_required_at).toBeNull();
  });

  it("does not hold the profile lock during remote refresh and does not redeem twice", async () => {
    const owner = await seed();
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const refresh = vi.fn(async () => {
      entered();
      await waiting;
      return {
        access_token: "next",
        refresh_token: "next-refresh",
        expires_in: 3600,
        refresh_token_expires_in: 86400,
        token_type: "bearer" as const,
      };
    });
    const first = resolveGarminCredentials({
      profileId: owner.profileId,
      repository: credentials,
      refresh,
    });
    await started;
    try {
      await expect(
        resolveGarminCredentials({ profileId: owner.profileId, repository: credentials, refresh }),
      ).rejects.toMatchObject({ disposition: "busy" });
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      release();
    }
    await expect(first).resolves.toBe("next");
  });

  it("commits recovery after invalid grant and never replays an uncertain refresh", async () => {
    const owner = await seed();
    const refresh = vi.fn().mockRejectedValue(new GarminOAuthError("invalid_grant"));
    await expect(
      resolveGarminCredentials({ profileId: owner.profileId, repository: credentials, refresh }),
    ).rejects.toMatchObject({ disposition: "reconnect_required" });
    expect((await stored(owner.integrationId))?.reconnect_required_at).toBeInstanceOf(Date);
    await expect(
      resolveGarminCredentials({ profileId: owner.profileId, repository: credentials, refresh }),
    ).rejects.toMatchObject({ disposition: "reconnect_required" });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("expires crashed claims to recovery instead of redeeming their token again", async () => {
    const owner = await seed();
    const now = new Date();
    const claim = await credentials.claim(owner.profileId, now);
    if (claim.kind !== "refresh") throw new Error("Expected refresh claim");
    const later = new Date(now.getTime() + 31_000);
    expect(await credentials.claim(owner.profileId, later)).toEqual({ kind: "reconnect_required" });
    expect(
      await credentials.finish(
        claim.claim,
        {
          kind: "success",
          accessToken: "late",
          refreshToken: "late",
          expiresAt: new Date(later.getTime() + 3_600_000),
        },
        later,
      ),
    ).toBe(false);
    expect((await stored(owner.integrationId))?.reconnect_required_at).toBeInstanceOf(Date);
  });

  it("fences rotated writes when disconnect wins and fences stale disconnect completion", async () => {
    const owner = await seed();
    const claim = await credentials.claim(owner.profileId);
    if (claim.kind !== "refresh") throw new Error("Expected refresh claim");
    const pending = await lifecycle.beginDisconnect(owner.profileId);
    if (pending.disposition !== "ready") throw new Error("Expected pending disconnect");
    expect(
      await credentials.finish(claim.claim, {
        kind: "success",
        accessToken: "stale",
        refreshToken: "stale",
        expiresAt: new Date(Date.now() + 3_600_000),
      }),
    ).toBe(false);
    expect(
      await lifecycle.finalizeDisconnect({ ...pending, generation: pending.generation - 1 }),
    ).toBe(false);
    expect(await stored(owner.integrationId)).toBeDefined();
    expect(await lifecycle.finalizeDisconnect(pending)).toBe(true);
    expect(await stored(owner.integrationId)).toBeUndefined();
    expect(await lifecycle.finalizeDisconnect(pending)).toBe(false);
  });

  it("rejects expired or stale disconnect finalization without deleting recovery credentials", async () => {
    const owner = await seed({ fresh: true });
    const expired = await lifecycle.beginDisconnect(owner.profileId);
    if (expired.disposition !== "ready") throw new Error("Expected pending disconnect");
    await db
      .update(providerSyncJobs)
      .set({ lock_expires_at: new Date(0) })
      .where(eq(providerSyncJobs.id, expired.jobId));
    expect(await lifecycle.finalizeDisconnect(expired)).toBe(false);
    expect(await stored(owner.integrationId)).toBeDefined();
    await lifecycle.failDisconnect(expired);

    const retry = await lifecycle.beginDisconnect(owner.profileId);
    if (retry.disposition !== "ready") throw new Error("Expected retry");
    expect(await lifecycle.finalizeDisconnect(expired)).toBe(false);
    expect(await lifecycle.finalizeDisconnect(retry)).toBe(true);
  });

  it("does not create pending without credentials and respects the locked onboarding gate", async () => {
    const missing = await seed({ missingCredentials: true });
    await expect(lifecycle.beginDisconnect(missing.profileId)).rejects.toThrow(
      "credentials are missing",
    );
    const [row] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, missing.integrationId));
    expect(row?.lifecycle_status).toBe("active");
    const locked = await seed({ fresh: true });
    await db
      .update(profiles)
      .set({ onboarding_status: "processing" })
      .where(eq(profiles.id, locked.profileId));
    await expect(lifecycle.beginDisconnect(locked.profileId)).rejects.toThrow(
      "onboarding processing",
    );
  });

  it("refreshes within Garmin's ten-minute safety margin and stores no secrets in receipts", async () => {
    const owner = await seed();
    await db
      .update(integrationCredentials)
      .set({ expires_at: new Date(Date.now() + 300_000) })
      .where(eq(integrationCredentials.integration_id, owner.integrationId));
    expect((await credentials.claim(owner.profileId)).kind).toBe("refresh");
    const jobs = await db
      .select()
      .from(providerSyncJobs)
      .where(eq(providerSyncJobs.integration_id, owner.integrationId));
    expect(jobs).toHaveLength(1);
    expect(JSON.stringify(jobs)).not.toContain("refresh-original");
    expect(JSON.stringify(jobs)).not.toContain("access-original");
  });
});
