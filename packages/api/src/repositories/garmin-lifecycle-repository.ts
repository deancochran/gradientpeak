import { randomUUID } from "node:crypto";
import { type DrizzleDbClient, schema } from "@repo/db";
import { and, eq, gt, sql } from "drizzle-orm";
import { decryptProviderToken } from "../lib/provider-token-crypto";
import { lockOnboardingProfile } from "./onboarding-lifecycle-repository";
import { lockProfileAdvisoryFence } from "./profile-advisory-fence";

type DisconnectAttempt =
  | { disposition: "not_found" }
  | {
      disposition: "ready";
      accessToken: string;
      generation: number;
      integrationId: string;
      profileId: string;
      jobId: string;
      owner: string;
      credentialGeneration: number;
    };

type ReadyDisconnect = Extract<DisconnectAttempt, { disposition: "ready" }>;

/** Durable Garmin disconnect fence for a direct (non-worker) remote deregistration. */
export function createGarminLifecycleRepository(db: DrizzleDbClient) {
  return {
    beginDisconnect(profileId: string): Promise<DisconnectAttempt> {
      return db.transaction(async (tx) => {
        await lockProfileAdvisoryFence(tx, profileId);
        const profile = await lockOnboardingProfile(tx, profileId);
        if (profile.onboarding_status === "processing" || profile.onboarding_status === "review") {
          throw new Error("Integration changes are unavailable during onboarding processing");
        }
        const [integration] = await tx
          .select({
            generation: schema.integrations.generation,
            id: schema.integrations.id,
            lifecycleStatus: schema.integrations.lifecycle_status,
          })
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.profile_id, profileId),
              eq(schema.integrations.provider, "garmin"),
            ),
          )
          .limit(1)
          .for("update");
        if (!integration || integration.lifecycleStatus === "disconnected")
          return { disposition: "not_found" };
        const [credentials] = await tx
          .select({
            accessToken: schema.integrationCredentials.access_token,
            generation: schema.integrationCredentials.generation,
          })
          .from(schema.integrationCredentials)
          .where(eq(schema.integrationCredentials.integration_id, integration.id))
          .limit(1)
          .for("update");
        // Do not create an unrecoverable pending lifecycle state without a credential
        // that can prove remote deregistration.
        if (!credentials)
          throw new Error("Garmin credentials are missing; reconnect before disconnecting");
        const generation =
          integration.lifecycleStatus === "active"
            ? integration.generation + 1
            : integration.generation;
        const now = new Date();
        const [running] = await tx
          .select({ id: schema.providerSyncJobs.id })
          .from(schema.providerSyncJobs)
          .where(
            and(
              eq(schema.providerSyncJobs.integration_id, integration.id),
              eq(schema.providerSyncJobs.integration_generation, generation),
              eq(schema.providerSyncJobs.job_type, "garmin_disconnect"),
              eq(schema.providerSyncJobs.status, "running"),
              gt(schema.providerSyncJobs.lock_expires_at, now),
            ),
          )
          .limit(1);
        if (running) throw new Error("Garmin disconnect is already in progress; retry shortly");
        if (integration.lifecycleStatus === "active") {
          await tx
            .update(schema.integrations)
            .set({
              disconnect_requested_at: new Date(),
              generation,
              lifecycle_status: "disconnect_pending",
              remote_revoked_at: null,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(schema.integrations.id, integration.id),
                eq(schema.integrations.generation, integration.generation),
                eq(schema.integrations.lifecycle_status, "active"),
              ),
            );
        }
        const owner = randomUUID();
        const [job] = await tx
          .insert(schema.providerSyncJobs)
          .values({
            profile_id: profileId,
            integration_id: integration.id,
            provider: "garmin",
            integration_generation: generation,
            job_type: "garmin_disconnect",
            status: "running",
            attempt: 1,
            max_attempts: 1,
            locked_at: now,
            locked_by: owner,
            lock_expires_at: new Date(now.getTime() + 30_000),
          })
          .returning({ id: schema.providerSyncJobs.id });
        if (!job) throw new Error("Garmin disconnect receipt could not be stored");
        return {
          disposition: "ready",
          accessToken: decryptProviderToken(credentials.accessToken),
          generation,
          integrationId: integration.id,
          profileId,
          jobId: job.id,
          owner,
          credentialGeneration: credentials.generation,
        };
      });
    },
    async failDisconnect(input: ReadyDisconnect, authenticationRejected = false): Promise<void> {
      await db.transaction(async (tx) => {
        await lockProfileAdvisoryFence(tx, input.profileId);
        const [job] = await tx
          .update(schema.providerSyncJobs)
          .set({
            status: "failed",
            last_error: "remote_removal_unconfirmed",
            locked_by: null,
            lock_expires_at: null,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(schema.providerSyncJobs.id, input.jobId),
              eq(schema.providerSyncJobs.profile_id, input.profileId),
              eq(schema.providerSyncJobs.locked_by, input.owner),
              eq(schema.providerSyncJobs.status, "running"),
            ),
          )
          .returning({ id: schema.providerSyncJobs.id });
        if (job && authenticationRejected) {
          // A server-rejected token must not be reused until its persisted expiry.
          // Refresh on the next explicit retry, without pretending consent was removed.
          await tx
            .update(schema.integrationCredentials)
            .set({
              expires_at: new Date(0),
              generation: sql`${schema.integrationCredentials.generation} + 1`,
              updated_at: new Date(),
            })
            .from(schema.integrations)
            .where(
              and(
                eq(schema.integrationCredentials.integration_id, input.integrationId),
                eq(schema.integrationCredentials.generation, input.credentialGeneration),
                eq(schema.integrations.id, input.integrationId),
                eq(schema.integrations.profile_id, input.profileId),
                eq(schema.integrations.generation, input.generation),
                eq(schema.integrations.lifecycle_status, "disconnect_pending"),
              ),
            );
        }
      });
    },
    finalizeDisconnect(input: ReadyDisconnect): Promise<boolean> {
      return db.transaction(async (tx) => {
        await lockProfileAdvisoryFence(tx, input.profileId);
        const [job] = await tx
          .select({ id: schema.providerSyncJobs.id })
          .from(schema.providerSyncJobs)
          .where(
            and(
              eq(schema.providerSyncJobs.id, input.jobId),
              eq(schema.providerSyncJobs.profile_id, input.profileId),
              eq(schema.providerSyncJobs.integration_id, input.integrationId),
              eq(schema.providerSyncJobs.integration_generation, input.generation),
              eq(schema.providerSyncJobs.job_type, "garmin_disconnect"),
              eq(schema.providerSyncJobs.locked_by, input.owner),
              eq(schema.providerSyncJobs.status, "running"),
              gt(schema.providerSyncJobs.lock_expires_at, new Date()),
            ),
          )
          .limit(1)
          .for("update");
        if (!job) return false;
        const [integration] = await tx
          .update(schema.integrations)
          .set({
            disconnected_at: new Date(),
            lifecycle_status: "disconnected",
            remote_revoked_at: new Date(),
            updated_at: new Date(),
          })
          .where(
            and(
              eq(schema.integrations.id, input.integrationId),
              eq(schema.integrations.profile_id, input.profileId),
              eq(schema.integrations.provider, "garmin"),
              eq(schema.integrations.generation, input.generation),
              eq(schema.integrations.lifecycle_status, "disconnect_pending"),
            ),
          )
          .returning({ id: schema.integrations.id });
        if (!integration) return false;
        await tx
          .delete(schema.integrationCredentials)
          .where(eq(schema.integrationCredentials.integration_id, input.integrationId));
        await tx
          .update(schema.providerSyncJobs)
          .set({
            status: "succeeded",
            locked_by: null,
            lock_expires_at: null,
            updated_at: new Date(),
          })
          .where(eq(schema.providerSyncJobs.id, input.jobId));
        return true;
      });
    },
  };
}
