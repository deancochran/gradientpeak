import type { DrizzleDbClient } from "@repo/db";
import { schema } from "@repo/db";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { DrizzleQueryExecutor, DrizzleTransactionClient } from "../../db";
import {
  decryptNullableProviderToken,
  decryptProviderToken,
  encryptProviderToken,
} from "../../lib/provider-token-crypto";
import {
  IntegrationDisconnectPendingError,
  IntegrationLifecycleChangedError,
  type IntegrationsRepositories,
} from "../../repositories";
import { lockOnboardingProfile } from "../../repositories/onboarding-lifecycle-repository";
import { lockProfileAdvisoryFence } from "../../repositories/profile-advisory-fence";

type OAuthIntegrationUpsertInput = Parameters<
  IntegrationsRepositories["integrations"]["upsertFromOAuthState"]
>[0];

async function upsertFromOAuthState(
  db: DrizzleTransactionClient,
  {
    state,
    now,
    profileId,
    provider,
    externalId,
    accessToken,
    refreshToken,
    expiresAt,
    scope,
    expectedIntegration,
  }: OAuthIntegrationUpsertInput,
) {
  await lockProfileAdvisoryFence(db, profileId);
  const profile = await lockOnboardingProfile(db, profileId);
  if (profile.onboarding_status === "processing" || profile.onboarding_status === "review") {
    throw new IntegrationLifecycleChangedError();
  }
  const [consumedState] = await db
    .delete(schema.oauthStates)
    .where(
      and(
        eq(schema.oauthStates.state, state),
        eq(schema.oauthStates.profile_id, profileId),
        eq(schema.oauthStates.provider, provider),
        gt(schema.oauthStates.expires_at, now),
      ),
    )
    .returning({ id: schema.oauthStates.id });

  if (!consumedState) return null;

  const [existingIntegration] = await db
    .select({
      generation: schema.integrations.generation,
      lifecycleStatus: schema.integrations.lifecycle_status,
    })
    .from(schema.integrations)
    .where(
      and(
        eq(schema.integrations.profile_id, profileId),
        eq(schema.integrations.provider, provider),
      ),
    )
    .limit(1)
    .for("update");
  if (existingIntegration?.lifecycleStatus === "disconnect_pending") {
    throw new IntegrationDisconnectPendingError();
  }
  const lifecycleChanged =
    expectedIntegration.kind === "absent"
      ? existingIntegration !== undefined
      : !existingIntegration ||
        existingIntegration.generation !== expectedIntegration.generation ||
        existingIntegration.lifecycleStatus !== expectedIntegration.lifecycleStatus;
  if (lifecycleChanged) throw new IntegrationLifecycleChangedError();

  const [integration] =
    expectedIntegration.kind === "absent"
      ? await db
          .insert(schema.integrations)
          .values({
            profile_id: profileId,
            provider,
            external_id: externalId,
          })
          .returning()
      : await db
          .update(schema.integrations)
          .set({
            disconnect_requested_at: null,
            disconnected_at: null,
            external_id: externalId,
            generation: sql`${schema.integrations.generation} + 1`,
            lifecycle_status: "active",
            remote_revoked_at: null,
            updated_at: now,
          })
          .where(
            and(
              eq(schema.integrations.profile_id, profileId),
              eq(schema.integrations.provider, provider),
              eq(schema.integrations.generation, expectedIntegration.generation),
              eq(schema.integrations.lifecycle_status, expectedIntegration.lifecycleStatus),
            ),
          )
          .returning();

  if (!integration) throw new IntegrationLifecycleChangedError();

  const [credentials] = await db
    .insert(schema.integrationCredentials)
    .values({
      integration_id: integration.id,
      access_token: encryptProviderToken(accessToken),
      refresh_token: refreshToken == null ? null : encryptProviderToken(refreshToken),
      expires_at: expiresAt,
      scope,
    })
    .onConflictDoUpdate({
      target: schema.integrationCredentials.integration_id,
      set: {
        access_token: encryptProviderToken(accessToken),
        refresh_token: refreshToken == null ? null : encryptProviderToken(refreshToken),
        expires_at: expiresAt,
        generation: sql`${schema.integrationCredentials.generation} + 1`,
        reconnect_required_at: null,
        scope,
        updated_at: now,
      },
    })
    .returning({ id: schema.integrationCredentials.integration_id });

  if (!credentials) throw new Error("Failed to upsert integration credentials");
  return integration;
}

export async function listIntegrationsByProfileId(
  db: DrizzleQueryExecutor,
  profileId: string,
  options: { forUpdate?: boolean } = {},
) {
  const query = db
    .select()
    .from(schema.integrations)
    .where(eq(schema.integrations.profile_id, profileId));
  return options.forUpdate ? query.for("update") : query;
}

export function createIntegrationsRepositories(db: DrizzleDbClient): IntegrationsRepositories {
  return {
    integrations: {
      async listByProfileId(profileId) {
        return listIntegrationsByProfileId(db, profileId);
      },

      async findByProfileIdAndProvider({ profileId, provider }) {
        const [row] = await db
          .select()
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.profile_id, profileId),
              eq(schema.integrations.provider, provider),
              eq(schema.integrations.lifecycle_status, "active"),
            ),
          )
          .limit(1);

        return row ?? null;
      },

      async findCredentialsByProfileIdAndProvider({ profileId, provider }) {
        const [row] = await db
          .select({ credentials: schema.integrationCredentials })
          .from(schema.integrations)
          .innerJoin(
            schema.integrationCredentials,
            eq(schema.integrationCredentials.integration_id, schema.integrations.id),
          )
          .where(
            and(
              eq(schema.integrations.profile_id, profileId),
              eq(schema.integrations.provider, provider),
              eq(schema.integrations.lifecycle_status, "active"),
            ),
          )
          .limit(1);

        if (!row?.credentials) return null;

        const accessToken = decryptProviderToken(row.credentials.access_token);
        const refreshToken = decryptNullableProviderToken(row.credentials.refresh_token);

        return {
          ...row.credentials,
          access_token: accessToken,
          refresh_token: refreshToken,
        };
      },

      async findGrantByProfileIdAndProvider({ profileId, provider }) {
        const [row] = await db
          .select({
            expires_at: schema.integrationCredentials.expires_at,
            reconnect_required_at: schema.integrationCredentials.reconnect_required_at,
            scope: schema.integrationCredentials.scope,
          })
          .from(schema.integrations)
          .innerJoin(
            schema.integrationCredentials,
            eq(schema.integrationCredentials.integration_id, schema.integrations.id),
          )
          .where(
            and(
              eq(schema.integrations.profile_id, profileId),
              eq(schema.integrations.provider, provider),
              eq(schema.integrations.lifecycle_status, "active"),
            ),
          )
          .limit(1);

        return row ?? null;
      },

      async upsertByProfileIdAndProvider({
        profileId,
        provider,
        externalId,
        accessToken,
        refreshToken,
        expiresAt,
        scope,
      }) {
        const [row] = await db
          .insert(schema.integrations)
          .values({
            profile_id: profileId,
            provider,
            external_id: externalId,
          })
          .onConflictDoUpdate({
            target: [schema.integrations.profile_id, schema.integrations.provider],
            set: {
              external_id: externalId,
              updated_at: new Date(),
            },
          })
          .returning();

        if (!row) {
          throw new Error("Failed to upsert integration");
        }

        const [credentials] = await db
          .insert(schema.integrationCredentials)
          .values({
            integration_id: row.id,
            access_token: encryptProviderToken(accessToken),
            refresh_token: refreshToken == null ? null : encryptProviderToken(refreshToken),
            expires_at: expiresAt,
            scope,
          })
          .onConflictDoUpdate({
            target: schema.integrationCredentials.integration_id,
            set: {
              access_token: encryptProviderToken(accessToken),
              refresh_token: refreshToken == null ? null : encryptProviderToken(refreshToken),
              expires_at: expiresAt,
              scope,
              updated_at: new Date(),
            },
          })
          .returning();

        if (!credentials) {
          throw new Error("Failed to upsert integration credentials");
        }

        return row;
      },

      async upsertFromOAuthState(input) {
        return db.transaction((tx) => upsertFromOAuthState(tx, input));
      },

      async upsertFromOAuthStateInTransaction(transaction, input) {
        return upsertFromOAuthState(transaction, input);
      },

      async updateTokensByProfileIdAndProvider({
        profileId,
        provider,
        accessToken,
        refreshToken,
        expiresAt,
      }) {
        const [integration] = await db
          .update(schema.integrations)
          .set({ updated_at: new Date() })
          .where(
            and(
              eq(schema.integrations.profile_id, profileId),
              eq(schema.integrations.provider, provider),
            ),
          )
          .returning({ id: schema.integrations.id });

        if (!integration) {
          return;
        }

        await db
          .insert(schema.integrationCredentials)
          .values({
            integration_id: integration.id,
            access_token: encryptProviderToken(accessToken),
            refresh_token: refreshToken == null ? null : encryptProviderToken(refreshToken),
            expires_at: expiresAt,
          })
          .onConflictDoUpdate({
            target: schema.integrationCredentials.integration_id,
            set: {
              access_token: encryptProviderToken(accessToken),
              refresh_token: refreshToken == null ? null : encryptProviderToken(refreshToken),
              expires_at: expiresAt,
              updated_at: new Date(),
            },
          });
      },

      async deleteByProfileIdAndProvider({ profileId, provider }) {
        await db
          .delete(schema.integrations)
          .where(
            and(
              eq(schema.integrations.profile_id, profileId),
              eq(schema.integrations.provider, provider),
            ),
          );
      },
    },

    oauthStates: {
      async create({
        state,
        profileId,
        provider,
        mobileRedirectUri,
        callbackUri,
        requestedScope,
        verifierHash,
        createdAt,
        expiresAt,
      }) {
        await db.insert(schema.oauthStates).values({
          id: crypto.randomUUID(),
          created_at: createdAt,
          profile_id: profileId,
          provider,
          state,
          mobile_redirect_uri: mobileRedirectUri,
          callback_uri: callbackUri,
          requested_scope: requestedScope,
          verifier_hash: verifierHash,
          expires_at: expiresAt,
        });
      },

      async deleteExpired({ now, profileId }) {
        const rows = await db
          .delete(schema.oauthStates)
          .where(
            profileId
              ? and(
                  eq(schema.oauthStates.profile_id, profileId),
                  lt(schema.oauthStates.expires_at, now),
                )
              : lt(schema.oauthStates.expires_at, now),
          )
          .returning({ id: schema.oauthStates.id });

        return rows.length;
      },

      async deleteCreatedBefore({ before, profileId }) {
        const rows = await db
          .delete(schema.oauthStates)
          .where(
            profileId
              ? and(
                  eq(schema.oauthStates.profile_id, profileId),
                  lt(schema.oauthStates.created_at, before),
                )
              : lt(schema.oauthStates.created_at, before),
          )
          .returning({ id: schema.oauthStates.id });

        return rows.length;
      },

      async findValidByState({ state, now }) {
        const [row] = await db
          .select()
          .from(schema.oauthStates)
          .where(and(eq(schema.oauthStates.state, state), gt(schema.oauthStates.expires_at, now)))
          .limit(1);

        return row ?? null;
      },

      async deleteByState(state) {
        await db.delete(schema.oauthStates).where(eq(schema.oauthStates.state, state));
      },
    },
  };
}
