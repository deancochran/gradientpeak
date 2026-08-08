import { formatDateOfBirth } from "@repo/core/profile";
import type { DrizzleDbClient, IntegrationCredentialRow, IntegrationRow } from "@repo/db";
import { schema } from "@repo/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createWahooSyncRepository } from "../infrastructure/repositories";
import { enqueueWahooProfileEnrichment } from "../lib/provider-sync/wahoo-profile-enrichment";
import { admitWahooReconciliation } from "./integrations/wahoo-reconciliation-admission";

const PROFILE_ENRICHMENT_RESOURCE = "profile_enrichment";
const PROFILE_ENRICHMENT_SYNC_MODE = "manual_refresh";
type ExecutableEnrichmentProvider = "wahoo";

type ImportedOnboardingField = "dob" | "gender" | "weight_kg";

type ImportedOnboardingValue = string | number;

type SyncMetadata = {
  status?: "queued" | "running" | "succeeded" | "partial" | "failed";
  blocking?: boolean;
  fields_imported?: ImportedOnboardingField[];
  fields_kept?: ImportedOnboardingField[];
  fields_updated?: ImportedOnboardingField[];
  imported_values?: Partial<Record<ImportedOnboardingField, ImportedOnboardingValue>>;
  partial_reason?: string;
  provider_error_code?: string;
};

export type ImportedOnboardingValues = {
  profile: {
    dob: string | null;
    gender: "male" | "female" | "other" | null;
    onboarded: boolean | null;
  };
  values: {
    dob?: string;
    gender?: "male" | "female" | "other";
    weight_kg?: number;
  };
  sources: Partial<
    Record<
      ImportedOnboardingField,
      {
        provider: ExecutableEnrichmentProvider;
        label: string;
        sourceRecordedAt: string | null;
      }
    >
  >;
};

type ServiceInput = {
  db: DrizzleDbClient;
};

export type ProviderSetupRefreshResult = {
  fieldsFilled: ImportedOnboardingField[];
  fieldsKept: ImportedOnboardingField[];
  fieldsUpdated: ImportedOnboardingField[];
  keptExistingValues: boolean;
  provider: ExecutableEnrichmentProvider;
  status: "queued" | "succeeded" | "partial" | "failed";
};

export class WahooProfileSetupService {
  private db: DrizzleDbClient;

  constructor({ db }: ServiceInput) {
    this.db = db;
  }

  async getImportedOnboardingValues(profileId: string): Promise<ImportedOnboardingValues> {
    const [profile] = await this.db
      .select({
        dob: schema.profiles.dob,
        gender: schema.profiles.gender,
        onboarded: schema.profiles.onboarded,
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, profileId))
      .limit(1);

    const values: ImportedOnboardingValues["values"] = {};
    const sources: ImportedOnboardingValues["sources"] = {};

    if (profile?.dob) values.dob = toDateOnlyString(profile.dob);
    if (profile?.gender) values.gender = profile.gender;

    const [latestWeight] = await this.db
      .select({
        value: schema.profileMetrics.value,
        recorded_at: schema.profileMetrics.recorded_at,
      })
      .from(schema.profileMetrics)
      .where(
        and(
          eq(schema.profileMetrics.profile_id, profileId),
          eq(schema.profileMetrics.metric_type, "weight_kg"),
        ),
      )
      .orderBy(desc(schema.profileMetrics.recorded_at), desc(schema.profileMetrics.id))
      .limit(1);

    if (latestWeight) values.weight_kg = latestWeight.value;

    const sourceHints = await this.getImportedFieldSources(profileId);

    for (const [field, source] of sourceHints) {
      sources[field] = {
        provider: source.provider,
        label: getProviderLabel(source.provider),
        sourceRecordedAt: source.recordedAt,
      };
    }

    return {
      profile: {
        dob: profile?.dob ? toDateOnlyString(profile.dob) : null,
        gender: profile?.gender ?? null,
        onboarded: profile?.onboarded ?? null,
      },
      values,
      sources,
    };
  }

  async refreshSetupData(
    profileId: string,
    provider: ExecutableEnrichmentProvider,
  ): Promise<ProviderSetupRefreshResult> {
    const integration = await this.getConnectedIntegration(profileId, provider);

    if (!integration) {
      throw new Error("Integration not found");
    }

    const credentials = await this.getIntegrationCredentials(integration.id);
    const admission = admitWahooReconciliation({
      integration,
      scope: credentials?.scope,
      target: "profile_enrichment",
      trigger: "manual",
    });
    if (!admission.admitted) {
      throw new Error("Integration not found");
    }
    await enqueueWahooProfileEnrichment({
      admission,
      providerSyncRepository: createWahooSyncRepository({ db: this.db }),
    });
    await this.writeSetupRefreshState(integration, "queued", { fields_imported: [] });

    return {
      fieldsFilled: [],
      fieldsKept: [],
      fieldsUpdated: [],
      keptExistingValues: false,
      provider,
      status: "queued",
    };
  }

  private async getImportedFieldSources(profileId: string) {
    const integrations = await this.getConnectedIntegrations(profileId);
    if (integrations.length === 0)
      return new Map<
        ImportedOnboardingField,
        {
          provider: ExecutableEnrichmentProvider;
          recordedAt: string | null;
          value?: ImportedOnboardingValue;
        }
      >();

    const syncRows = await this.db
      .select()
      .from(schema.providerSyncState)
      .where(
        and(
          inArray(
            schema.providerSyncState.integration_id,
            integrations.map((integration) => integration.id),
          ),
          eq(schema.providerSyncState.resource, PROFILE_ENRICHMENT_RESOURCE),
        ),
      );

    const integrationById = new Map(
      integrations.map((integration) => [integration.id, integration]),
    );
    const sources = new Map<
      ImportedOnboardingField,
      {
        provider: ExecutableEnrichmentProvider;
        recordedAt: string | null;
        value?: ImportedOnboardingValue;
      }
    >();

    for (const row of syncRows) {
      const integration = integrationById.get(row.integration_id);
      if (!integration) continue;
      const metadata = parseSyncMetadata(row.metadata);
      for (const field of metadata.fields_imported ?? []) {
        if (!sources.has(field)) {
          sources.set(field, {
            provider: "wahoo",
            recordedAt: row.last_sync_succeeded_at?.toISOString() ?? null,
            ...(metadata.imported_values?.[field] === undefined
              ? {}
              : { value: metadata.imported_values[field] }),
          });
        }
      }
    }

    return sources;
  }

  private async writeSetupRefreshState(
    integration: IntegrationRow,
    status: "queued" | "running" | "succeeded" | "partial" | "failed",
    metadata: Pick<
      SyncMetadata,
      | "fields_imported"
      | "fields_kept"
      | "fields_updated"
      | "imported_values"
      | "partial_reason"
      | "provider_error_code"
    >,
    lastError?: string,
  ) {
    const now = new Date();
    const isSuccess = status === "succeeded" || status === "partial";
    const isFailure = status === "failed";

    try {
      await this.db
        .insert(schema.providerSyncState)
        .values({
          integration_id: integration.id,
          provider: integration.provider,
          resource: PROFILE_ENRICHMENT_RESOURCE,
          sync_mode: PROFILE_ENRICHMENT_SYNC_MODE,
          last_sync_started_at: status === "running" ? now : null,
          last_sync_succeeded_at: isSuccess ? now : null,
          last_sync_failed_at: isFailure ? now : null,
          consecutive_failures: isFailure ? 1 : 0,
          last_error: lastError,
          metadata: { ...metadata, status },
        })
        .onConflictDoUpdate({
          target: [schema.providerSyncState.integration_id, schema.providerSyncState.resource],
          set: {
            sync_mode: PROFILE_ENRICHMENT_SYNC_MODE,
            last_sync_started_at: status === "running" ? now : undefined,
            last_sync_succeeded_at: isSuccess ? now : undefined,
            last_sync_failed_at: isFailure ? now : undefined,
            consecutive_failures: isFailure ? 1 : 0,
            last_error: lastError ?? null,
            metadata: { ...metadata, status },
            updated_at: now,
          },
        });
    } catch (error) {
      console.warn("Failed to write profile enrichment sync state", error);
    }
  }

  private async getConnectedIntegrations(profileId: string) {
    const conditions = [
      eq(schema.integrations.profile_id, profileId),
      eq(schema.integrations.lifecycle_status, "active"),
      eq(schema.integrations.provider, "wahoo"),
    ];

    return await this.db
      .select()
      .from(schema.integrations)
      .where(and(...conditions));
  }

  private async getConnectedIntegration(profileId: string, provider: ExecutableEnrichmentProvider) {
    const [integration] = await this.db
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

    return integration ?? null;
  }

  private async getIntegrationCredentials(
    integrationId: string,
  ): Promise<IntegrationCredentialRow | null> {
    const [credentials] = await this.db
      .select()
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.integration_id, integrationId))
      .limit(1);

    return credentials ?? null;
  }
}

function parseSyncMetadata(value: unknown): SyncMetadata {
  return value && typeof value === "object" ? (value as SyncMetadata) : {};
}

function getProviderLabel(_provider: ExecutableEnrichmentProvider) {
  return "Wahoo";
}

function toDateOnlyString(date: Date) {
  return formatDateOfBirth(date);
}
