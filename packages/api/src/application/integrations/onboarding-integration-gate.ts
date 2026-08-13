import { integrations, oauthStates, profiles } from "@repo/db";
import { and, eq, gt } from "drizzle-orm";
import type { DrizzleQueryExecutor, DrizzleTransactionClient } from "../../db";
import { lockOnboardingProfile } from "../../repositories/onboarding-lifecycle-repository";
import { lockProfileAdvisoryFence } from "../../repositories/profile-advisory-fence";

export class IntegrationOnboardingClosedError extends Error {
  constructor() {
    super(
      "Integration changes are unavailable while onboarding data is processing or under review",
    );
    this.name = "IntegrationOnboardingClosedError";
  }
}

export class IntegrationDisconnectPendingError extends Error {
  constructor() {
    super("Integration disconnect is still in progress");
    this.name = "IntegrationDisconnectPendingError";
  }
}

export function integrationManagementIsClosed(
  onboardingStatus: "provider_selection" | "processing" | "review" | "completed" | undefined,
) {
  return onboardingStatus === "processing" || onboardingStatus === "review";
}

export async function assertIntegrationManagementOpen(db: DrizzleQueryExecutor, profileId: string) {
  const [profile] = await db
    .select({ onboardingStatus: profiles.onboarding_status })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (integrationManagementIsClosed(profile?.onboardingStatus)) {
    throw new IntegrationOnboardingClosedError();
  }
}

/**
 * Serializes the status check with the integration effect. Callers must perform every durable
 * integration mutation/enqueue through the supplied transaction and keep provider I/O outside it.
 */
export async function withOpenIntegrationManagementTransaction<T>(input: {
  db: { transaction<R>(operation: (tx: DrizzleTransactionClient) => Promise<R>): Promise<R> };
  profileId: string;
  operation: (tx: DrizzleTransactionClient) => Promise<T>;
}): Promise<T> {
  return input.db.transaction(async (tx) => {
    await lockProfileAdvisoryFence(tx, input.profileId);
    const profile = await lockOnboardingProfile(tx, input.profileId);
    if (integrationManagementIsClosed(profile.onboarding_status)) {
      throw new IntegrationOnboardingClosedError();
    }
    return input.operation(tx);
  });
}

export async function createPendingOAuthStateWithFence(input: {
  db: { transaction<R>(operation: (tx: DrizzleTransactionClient) => Promise<R>): Promise<R> };
  profileId: string;
  provider: "wahoo";
  state: string;
  callbackUri: string;
  requestedScope: string;
  verifierHash: string;
  mobileRedirectUri: string;
  createdAt: Date;
  expiresAt: Date;
}) {
  return withOpenIntegrationManagementTransaction({
    db: input.db,
    profileId: input.profileId,
    operation: async (tx) => {
      const [existingIntegration] = await tx
        .select({ lifecycleStatus: integrations.lifecycle_status })
        .from(integrations)
        .where(
          and(
            eq(integrations.profile_id, input.profileId),
            eq(integrations.provider, input.provider),
          ),
        )
        .limit(1)
        .for("update");
      if (existingIntegration?.lifecycleStatus === "disconnect_pending") {
        throw new IntegrationDisconnectPendingError();
      }

      // One outstanding intent per owner/provider. Replacing it makes abandoned browser sessions
      // immediately recoverable while preserving one-time callback consumption.
      await tx
        .delete(oauthStates)
        .where(
          and(
            eq(oauthStates.profile_id, input.profileId),
            eq(oauthStates.provider, input.provider),
          ),
        );
      await tx.insert(oauthStates).values({
        id: crypto.randomUUID(),
        callback_uri: input.callbackUri,
        created_at: input.createdAt,
        expires_at: input.expiresAt,
        mobile_redirect_uri: input.mobileRedirectUri,
        profile_id: input.profileId,
        provider: input.provider,
        requested_scope: input.requestedScope,
        state: input.state,
        verifier_hash: input.verifierHash,
      });
    },
  });
}

export async function cancelPendingOAuthWithFence(input: {
  db: { transaction<R>(operation: (tx: DrizzleTransactionClient) => Promise<R>): Promise<R> };
  profileId: string;
  provider: "wahoo";
  now?: Date;
}) {
  return input.db.transaction(async (tx) => {
    await lockProfileAdvisoryFence(tx, input.profileId);
    const profile = await lockOnboardingProfile(tx, input.profileId);
    if (profile.onboarding_status !== "provider_selection") {
      throw new IntegrationOnboardingClosedError();
    }
    const removed = await tx
      .delete(oauthStates)
      .where(
        and(
          eq(oauthStates.profile_id, input.profileId),
          eq(oauthStates.provider, input.provider),
          gt(oauthStates.expires_at, input.now ?? new Date()),
        ),
      )
      .returning({ id: oauthStates.id });
    return { cancelled: removed.length };
  });
}
