import type { DrizzleDbClient, IntegrationRow } from "@repo/db";
import { schema } from "@repo/db";
import { and, eq, gt, lt } from "drizzle-orm";
import type { IntegrationsRepositories } from "../../repositories";

export function createIntegrationsRepositories(db: DrizzleDbClient): IntegrationsRepositories {
  return {
    integrations: {
      async listByProfileId(profileId) {
        const rows = await db
          .select()
          .from(schema.integrations)
          .where(eq(schema.integrations.profile_id, profileId));

        return rows as IntegrationRow[];
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

      async upsertByProfileIdAndProvider({
        profileId,
        provider,
        externalId,
        accessToken,
        refreshToken,
        expiresAt,
        scope,
      }) {
        await db
          .insert(schema.integrations)
          .values({
            profile_id: profileId,
            provider,
            external_id: externalId,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
            scope,
          })
          .onConflictDoUpdate({
            target: [schema.integrations.profile_id, schema.integrations.provider],
            set: {
              external_id: externalId,
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: expiresAt,
              scope,
              updated_at: new Date(),
            },
          });
      },

      async updateTokensByProfileIdAndProvider({
        profileId,
        provider,
        accessToken,
        refreshToken,
        expiresAt,
      }) {
        await db
          .update(schema.integrations)
          .set({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(schema.integrations.profile_id, profileId),
              eq(schema.integrations.provider, provider),
            ),
          );
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
