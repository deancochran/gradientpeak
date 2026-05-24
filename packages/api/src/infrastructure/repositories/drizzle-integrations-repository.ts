import type { DrizzleDbClient } from "@repo/db";
import { schema } from "@repo/db";
import { and, eq, gt, lt } from "drizzle-orm";
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

        return row?.credentials ?? null;
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
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
            scope,
          })
          .onConflictDoUpdate({
            target: schema.integrationCredentials.integration_id,
            set: {
              access_token: accessToken,
              refresh_token: refreshToken,
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
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
          })
          .onConflictDoUpdate({
            target: schema.integrationCredentials.integration_id,
            set: {
              access_token: accessToken,
              refresh_token: refreshToken,
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
