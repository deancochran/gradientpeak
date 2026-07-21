import type { DrizzleDbClient } from "@repo/db";
import { schema } from "@repo/db";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import {
  decryptNullableProviderToken,
  decryptProviderToken,
  encryptProviderToken,
  hasProviderTokenEncryptionKey,
  isEncryptedProviderToken,
} from "../../lib/provider-token-crypto";
import type { IntegrationsRepositories } from "../../repositories";

export function createIntegrationsRepositories(db: DrizzleDbClient): IntegrationsRepositories {
  return {
    integrations: {
      async listByProfileId(profileId) {
        return db
          .select()
          .from(schema.integrations)
          .where(eq(schema.integrations.profile_id, profileId));
      },

      async findByProfileIdAndProvider({ profileId, provider }) {
        const [row] = await db
          .select()
          .from(schema.integrations)
          .where(
            and(
              eq(schema.integrations.profile_id, profileId),
              eq(schema.integrations.provider, provider),
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
            ),
          )
          .limit(1);

        if (!row?.credentials) return null;

        const accessToken = decryptProviderToken(row.credentials.access_token);
        const refreshToken = decryptNullableProviderToken(row.credentials.refresh_token);
        const hasLegacyCredential =
          !isEncryptedProviderToken(row.credentials.access_token) ||
          (row.credentials.refresh_token !== null &&
            !isEncryptedProviderToken(row.credentials.refresh_token));

        if (hasLegacyCredential && hasProviderTokenEncryptionKey()) {
          await db
            .update(schema.integrationCredentials)
            .set({
              access_token: encryptProviderToken(accessToken),
              refresh_token: refreshToken === null ? null : encryptProviderToken(refreshToken),
              updated_at: new Date(),
            })
            .where(
              and(
                eq(schema.integrationCredentials.integration_id, row.credentials.integration_id),
                eq(schema.integrationCredentials.access_token, row.credentials.access_token),
                row.credentials.refresh_token === null
                  ? isNull(schema.integrationCredentials.refresh_token)
                  : eq(schema.integrationCredentials.refresh_token, row.credentials.refresh_token),
              ),
            );
        }

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

      async upsertFromOAuthState({
        state,
        now,
        profileId,
        provider,
        externalId,
        accessToken,
        refreshToken,
        expiresAt,
        scope,
      }) {
        return db.transaction(async (tx) => {
          const [consumedState] = await tx
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

          const [integration] = await tx
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
                updated_at: now,
              },
            })
            .returning();

          if (!integration) throw new Error("Failed to upsert integration");

          const [credentials] = await tx
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
                scope,
                updated_at: now,
              },
            })
            .returning({ id: schema.integrationCredentials.integration_id });

          if (!credentials) throw new Error("Failed to upsert integration credentials");
          return integration;
        });
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
      async create({ state, profileId, provider, mobileRedirectUri, createdAt, expiresAt }) {
        await db.insert(schema.oauthStates).values({
          id: crypto.randomUUID(),
          created_at: createdAt,
          profile_id: profileId,
          provider,
          state,
          mobile_redirect_uri: mobileRedirectUri,
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
