import { randomUUID } from "node:crypto";
import { type DrizzleDbClient, schema } from "@repo/db";
import { and, eq, gt, sql } from "drizzle-orm";
import {
  decryptNullableProviderToken,
  decryptProviderToken,
  encryptProviderToken,
} from "../lib/provider-token-crypto";
import { lockProfileAdvisoryFence } from "./profile-advisory-fence";

const JOB_TYPE = "garmin_token_refresh";
const REFRESH_MARGIN_MS = 600_000;
const CLAIM_MS = 30_000;

export type GarminRefreshClaim = {
  profileId: string;
  integrationId: string;
  integrationGeneration: number;
  credentialGeneration: number;
  disconnectPending: boolean;
  jobId: string;
  owner: string;
  refreshToken: string;
};
type CredentialResult =
  | { kind: "ready"; accessToken: string }
  | { kind: "refresh"; claim: GarminRefreshClaim }
  | { kind: "busy" | "reconnect_required" | "disconnect_pending" | "missing" };

/** Short, fenced transactions only. No provider request runs while holding a DB lock.
 * Refresh jobs are durable redemption receipts, not background worker jobs. An expired
 * claim is ambiguous and must never cause another redemption of the same token.
 */
export function createGarminCredentialRepository(db: DrizzleDbClient) {
  return {
    claim(profileId: string, now = new Date()): Promise<CredentialResult> {
      return db.transaction(async (tx) => {
        await lockProfileAdvisoryFence(tx, profileId);
        const [row] = await tx
          .select({
            id: schema.integrations.id,
            integrationGeneration: schema.integrations.generation,
            lifecycle: schema.integrations.lifecycle_status,
            credentialGeneration: schema.integrationCredentials.generation,
            accessToken: schema.integrationCredentials.access_token,
            refreshToken: schema.integrationCredentials.refresh_token,
            expiresAt: schema.integrationCredentials.expires_at,
            reconnectAt: schema.integrationCredentials.reconnect_required_at,
          })
          .from(schema.integrations)
          .innerJoin(
            schema.integrationCredentials,
            eq(schema.integrationCredentials.integration_id, schema.integrations.id),
          )
          .where(
            and(
              eq(schema.integrations.profile_id, profileId),
              eq(schema.integrations.provider, "garmin"),
            ),
          )
          .limit(1)
          .for("update");
        if (!row || row.lifecycle === "disconnected") return { kind: "missing" };
        const recovery =
          row.lifecycle === "disconnect_pending" ? "disconnect_pending" : "reconnect_required";
        if (row.reconnectAt) return { kind: recovery };
        if (row.expiresAt && row.expiresAt.getTime() > now.getTime() + REFRESH_MARGIN_MS) {
          return { kind: "ready", accessToken: decryptProviderToken(row.accessToken) };
        }
        const [running] = await tx
          .select({
            id: schema.providerSyncJobs.id,
            expiresAt: schema.providerSyncJobs.lock_expires_at,
          })
          .from(schema.providerSyncJobs)
          .where(
            and(
              eq(schema.providerSyncJobs.integration_id, row.id),
              eq(schema.providerSyncJobs.integration_generation, row.integrationGeneration),
              eq(schema.providerSyncJobs.job_type, JOB_TYPE),
              eq(schema.providerSyncJobs.status, "running"),
            ),
          )
          .limit(1)
          .for("update");
        if (running?.expiresAt && running.expiresAt > now) return { kind: "busy" };
        const refreshToken = decryptNullableProviderToken(row.refreshToken);
        if (running || !refreshToken) {
          // Return the error disposition, rather than throw, so this marker commits.
          await tx
            .update(schema.integrationCredentials)
            .set({
              reconnect_required_at: now,
              updated_at: now,
              generation: sql`${schema.integrationCredentials.generation} + 1`,
            })
            .where(eq(schema.integrationCredentials.integration_id, row.id));
          if (running)
            await tx
              .update(schema.providerSyncJobs)
              .set({
                status: "failed",
                last_error: "refresh_outcome_unknown",
                updated_at: now,
                locked_by: null,
                lock_expires_at: null,
              })
              .where(eq(schema.providerSyncJobs.id, running.id));
          return { kind: recovery };
        }
        const owner = randomUUID();
        const [job] = await tx
          .insert(schema.providerSyncJobs)
          .values({
            profile_id: profileId,
            integration_id: row.id,
            provider: "garmin",
            integration_generation: row.integrationGeneration,
            job_type: JOB_TYPE,
            status: "running",
            locked_by: owner,
            locked_at: now,
            lock_expires_at: new Date(now.getTime() + CLAIM_MS),
            max_attempts: 1,
            attempt: 1,
            // Never put credentials in the receipt payload.
            payload: { credentialGeneration: row.credentialGeneration },
          })
          .returning({ id: schema.providerSyncJobs.id });
        if (!job) throw new Error("Garmin refresh receipt could not be stored");
        return {
          kind: "refresh",
          claim: {
            profileId,
            integrationId: row.id,
            integrationGeneration: row.integrationGeneration,
            credentialGeneration: row.credentialGeneration,
            disconnectPending: row.lifecycle === "disconnect_pending",
            jobId: job.id,
            owner,
            refreshToken,
          },
        };
      });
    },
    finish(
      claim: GarminRefreshClaim,
      result:
        | { kind: "success"; accessToken: string; refreshToken: string; expiresAt: Date }
        | { kind: "failed"; reconnect: boolean },
      now = new Date(),
    ): Promise<boolean> {
      return db.transaction(async (tx) => {
        await lockProfileAdvisoryFence(tx, claim.profileId);
        const [job] = await tx
          .select({ id: schema.providerSyncJobs.id })
          .from(schema.providerSyncJobs)
          .where(
            and(
              eq(schema.providerSyncJobs.id, claim.jobId),
              eq(schema.providerSyncJobs.profile_id, claim.profileId),
              eq(schema.providerSyncJobs.integration_id, claim.integrationId),
              eq(schema.providerSyncJobs.integration_generation, claim.integrationGeneration),
              eq(schema.providerSyncJobs.job_type, JOB_TYPE),
              eq(schema.providerSyncJobs.status, "running"),
              eq(schema.providerSyncJobs.locked_by, claim.owner),
              gt(schema.providerSyncJobs.lock_expires_at, now),
            ),
          )
          .limit(1)
          .for("update");
        if (!job) return false;
        const [integration] = await tx
          .select({ lifecycle: schema.integrations.lifecycle_status })
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.id, claim.integrationId),
              eq(schema.integrations.profile_id, claim.profileId),
              eq(schema.integrations.provider, "garmin"),
              eq(schema.integrations.generation, claim.integrationGeneration),
            ),
          )
          .limit(1)
          .for("update");
        let applied = false;
        if (integration && integration.lifecycle !== "disconnected") {
          const [updated] = await tx
            .update(schema.integrationCredentials)
            .set({
              ...(result.kind === "success"
                ? {
                    access_token: encryptProviderToken(result.accessToken),
                    refresh_token: encryptProviderToken(result.refreshToken),
                    expires_at: result.expiresAt,
                    reconnect_required_at: null,
                  }
                : result.reconnect
                  ? { reconnect_required_at: now }
                  : {}),
              generation: sql`${schema.integrationCredentials.generation} + 1`,
              updated_at: now,
            })
            .where(
              and(
                eq(schema.integrationCredentials.integration_id, claim.integrationId),
                eq(schema.integrationCredentials.generation, claim.credentialGeneration),
              ),
            )
            .returning({ id: schema.integrationCredentials.integration_id });
          applied = Boolean(updated);
        }
        await tx
          .update(schema.providerSyncJobs)
          .set({
            status: applied && result.kind === "success" ? "succeeded" : "failed",
            last_error: applied && result.kind === "success" ? null : "refresh_not_completed",
            locked_by: null,
            lock_expires_at: null,
            updated_at: now,
          })
          .where(eq(schema.providerSyncJobs.id, claim.jobId));
        return applied;
      });
    },
  };
}
