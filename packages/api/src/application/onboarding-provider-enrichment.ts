import { randomUUID } from "node:crypto";
import type {
  DrizzleDbClient,
  IntegrationCredentialRow,
  IntegrationRow,
  PublicIntegrationProvider,
} from "@repo/db";
import { schema } from "@repo/db";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import {
  createWahooClient,
  type WahooApiError,
  type WahooUser,
} from "../lib/integrations/wahoo/client";
import { batchInsertActivityEfforts, deriveEffortsForSport } from "../utils/onboarding-helpers";

const ONBOARDING_ENRICHMENT_RESOURCE = "onboarding_enrichment";
const ONBOARDING_SYNC_MODE = "onboarding_enrichment";
const PROFILE_ENRICHMENT_RESOURCE = "profile_enrichment";
const PROFILE_ENRICHMENT_SYNC_MODE = "manual_refresh";
const WAHOO_ONBOARDING_REQUEST_TIMEOUT_MS = 15_000;
const RECENT_REAL_EFFORT_WINDOW_DAYS = 90;
const ENRICHMENT_PROVIDERS = new Set<PublicIntegrationProvider>(["wahoo"]);

export type OnboardingProviderSyncStatus =
  | "idle"
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "timed_out";

export type OnboardingProviderItemStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "partial"
  | "failed"
  | "timed_out"
  | "skipped_unsupported"
  | "requirement_cleared";

type ImportedOnboardingField = "dob" | "gender" | "weight_kg" | "ftp";

type ImportedOnboardingValue = string | number;

type SyncMetadata = {
  status?: OnboardingProviderItemStatus;
  blocking?: boolean;
  fields_imported?: ImportedOnboardingField[];
  fields_kept?: ImportedOnboardingField[];
  fields_updated?: ImportedOnboardingField[];
  imported_values?: Partial<Record<ImportedOnboardingField, ImportedOnboardingValue>>;
  partial_reason?: string;
  provider_error_code?: string;
  cleared_at?: string;
};

export type OnboardingProviderEnrichmentStatus = {
  status: OnboardingProviderSyncStatus;
  canContinue: boolean;
  providers: Array<{
    provider: PublicIntegrationProvider;
    status: OnboardingProviderItemStatus;
    blocking: boolean;
    connected: boolean;
    message?: string;
    lastSyncStartedAt: string | null;
    lastSyncSucceededAt: string | null;
    lastSyncFailedAt: string | null;
  }>;
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
    ftp?: number;
  };
  sources: Partial<
    Record<
      ImportedOnboardingField,
      {
        provider: PublicIntegrationProvider;
        label: string;
        sourceRecordedAt: string | null;
      }
    >
  >;
};

type CanonicalImport = {
  field: ImportedOnboardingField;
  value: ImportedOnboardingValue;
};

type ServiceInput = {
  db: DrizzleDbClient;
};

export type ProviderSetupRefreshResult = {
  fieldsFilled: ImportedOnboardingField[];
  fieldsKept: ImportedOnboardingField[];
  fieldsUpdated: ImportedOnboardingField[];
  keptExistingValues: boolean;
  provider: PublicIntegrationProvider;
  status: "succeeded" | "partial" | "failed";
};

export class OnboardingProviderEnrichmentService {
  private db: DrizzleDbClient;

  constructor({ db }: ServiceInput) {
    this.db = db;
  }

  async start(profileId: string, selectedProviders?: PublicIntegrationProvider[]) {
    const integrations = await this.getConnectedIntegrations(profileId, selectedProviders);

    for (const integration of integrations) {
      if (!ENRICHMENT_PROVIDERS.has(integration.provider)) {
        await this.writeSyncState(integration, "skipped_unsupported", {
          blocking: false,
          partial_reason: "Provider does not support onboarding enrichment yet.",
        });
        continue;
      }

      if (integration.provider === "wahoo") {
        await this.enrichWahoo(integration);
      }
    }

    return this.getStatus(profileId);
  }

  async getStatus(profileId: string): Promise<OnboardingProviderEnrichmentStatus> {
    const integrations = await this.getConnectedIntegrations(profileId);

    if (integrations.length === 0) {
      return { status: "idle", canContinue: true, providers: [] };
    }

    const syncRows = await this.db
      .select()
      .from(schema.providerSyncState)
      .where(
        and(
          inArray(
            schema.providerSyncState.integration_id,
            integrations.map((integration) => integration.id),
          ),
          eq(schema.providerSyncState.resource, ONBOARDING_ENRICHMENT_RESOURCE),
        ),
      );

    const rowsByIntegrationId = new Map(syncRows.map((row) => [row.integration_id, row]));
    const providers = integrations.map((integration) => {
      const row = rowsByIntegrationId.get(integration.id);
      const metadata = parseSyncMetadata(row?.metadata);
      const status =
        metadata.status ??
        (ENRICHMENT_PROVIDERS.has(integration.provider) ? "queued" : "skipped_unsupported");
      const blocking = metadata.blocking ?? ENRICHMENT_PROVIDERS.has(integration.provider);

      return {
        provider: integration.provider,
        status,
        blocking,
        connected: true,
        message: getProviderStatusMessage(status, metadata),
        lastSyncStartedAt: row?.last_sync_started_at?.toISOString() ?? null,
        lastSyncSucceededAt: row?.last_sync_succeeded_at?.toISOString() ?? null,
        lastSyncFailedAt: row?.last_sync_failed_at?.toISOString() ?? null,
      };
    });

    const blockingProviders = providers.filter((provider) => provider.blocking);
    const hasRunning = blockingProviders.some((provider) =>
      ["queued", "running"].includes(provider.status),
    );
    const hasFailed = blockingProviders.some((provider) =>
      ["failed", "timed_out"].includes(provider.status),
    );
    const hasPartial = providers.some((provider) => provider.status === "partial");

    const status: OnboardingProviderSyncStatus = hasRunning
      ? "running"
      : hasFailed
        ? "failed"
        : hasPartial
          ? "partial"
          : providers.length > 0
            ? "succeeded"
            : "idle";

    return {
      status,
      canContinue: !hasRunning && !hasFailed,
      providers,
    };
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
      .orderBy(desc(schema.profileMetrics.recorded_at))
      .limit(1);

    if (typeof latestWeight?.value === "number") values.weight_kg = latestWeight.value;

    const sourceHints = await this.getImportedFieldSources(profileId);

    for (const [field, source] of sourceHints) {
      const metadataValue = source.value;
      if (field === "ftp" && typeof metadataValue === "number") values.ftp = metadataValue;
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

  /** @deprecated Use getImportedOnboardingValues. */
  async getDraft(profileId: string): Promise<ImportedOnboardingValues> {
    return this.getImportedOnboardingValues(profileId);
  }

  async clearProviderRequirement(profileId: string, provider: PublicIntegrationProvider) {
    const integration = await this.getConnectedIntegration(profileId, provider);

    if (integration) {
      await this.writeSyncState(integration, "requirement_cleared", {
        blocking: false,
        cleared_at: new Date().toISOString(),
      });
    }

    return this.getStatus(profileId);
  }

  async refreshSetupData(
    profileId: string,
    provider: PublicIntegrationProvider,
  ): Promise<ProviderSetupRefreshResult> {
    const integration = await this.getConnectedIntegration(profileId, provider);

    if (!integration) {
      throw new Error("Integration not found");
    }

    if (provider !== "wahoo") {
      await this.writeSetupRefreshState(integration, "partial", {
        fields_imported: [],
        partial_reason: "Provider does not support setup refresh yet.",
      });

      return {
        fieldsFilled: [],
        fieldsKept: [],
        fieldsUpdated: [],
        keptExistingValues: false,
        provider,
        status: "partial",
      };
    }

    await this.writeSetupRefreshState(integration, "running", { fields_imported: [] });

    const credentials = await this.getIntegrationCredentials(integration.id);
    if (!credentials) {
      await this.writeSetupRefreshState(
        integration,
        "failed",
        { fields_imported: [], provider_error_code: "missing_credentials" },
        "Integration credentials are unavailable.",
      );

      return {
        fieldsFilled: [],
        fieldsKept: [],
        fieldsUpdated: [],
        keptExistingValues: false,
        provider,
        status: "failed",
      };
    }

    const client = createWahooClient({
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token ?? undefined,
    });
    const fieldsFilled: ImportedOnboardingField[] = [];
    const fieldsKept: ImportedOnboardingField[] = [];
    const fieldsUpdated: ImportedOnboardingField[] = [];
    const now = new Date();

    try {
      const user = await withTimeout(
        client.getUserProfile(),
        WAHOO_ONBOARDING_REQUEST_TIMEOUT_MS,
        "Wahoo setup refresh timed out",
      );
      const userImports = normalizeWahooUser(user);
      const writeResult = await this.writeMissingCanonicalImports(integration, userImports);
      fieldsFilled.push(...writeResult.fieldsFilled);
      fieldsKept.push(...writeResult.fieldsKept);
      fieldsUpdated.push(...writeResult.fieldsUpdated);
    } catch (error) {
      await this.writeSetupRefreshState(
        integration,
        isTimeoutError(error) ? "failed" : "failed",
        {
          fields_imported: fieldsFilled,
          fields_kept: fieldsKept,
          fields_updated: fieldsUpdated,
          provider_error_code: getProviderErrorCode(error),
        },
        sanitizeProviderError(error),
      );
      return {
        fieldsFilled,
        fieldsKept,
        fieldsUpdated,
        keptExistingValues: fieldsKept.length > 0,
        provider,
        status: "failed",
      };
    }

    let ftp: number | null = null;
    let status: ProviderSetupRefreshResult["status"] = "succeeded";
    try {
      const powerZones = await withTimeout(
        client.getPowerZones(),
        WAHOO_ONBOARDING_REQUEST_TIMEOUT_MS,
        "Wahoo power-zone refresh timed out",
      );
      ftp = normalizeFtp(powerZones.ftp ?? powerZones.critical_power);
      if (ftp !== null) {
        const didWriteFtp = await this.writeProviderMetric(integration, "ftp", ftp, "w", now);
        if (didWriteFtp.wrote) {
          fieldsUpdated.push("ftp");
          await this.writeModeledCyclingEffortsFromFtp(integration.profile_id, ftp);
        }
      }
    } catch (error) {
      status = "partial";
      await this.writeSetupRefreshState(
        integration,
        status,
        {
          fields_imported: fieldsFilled,
          fields_kept: fieldsKept,
          fields_updated: fieldsUpdated,
          imported_values: ftp !== null ? { ftp } : undefined,
          partial_reason: "Power zones unavailable.",
          provider_error_code: getProviderErrorCode(error),
        },
        sanitizeProviderError(error),
      );
      return {
        fieldsFilled,
        fieldsKept,
        fieldsUpdated,
        keptExistingValues: fieldsKept.length > 0,
        provider,
        status,
      };
    }

    await this.writeSetupRefreshState(integration, status, {
      fields_imported: fieldsFilled,
      fields_kept: fieldsKept,
      fields_updated: fieldsUpdated,
      imported_values: ftp !== null ? { ftp } : undefined,
    });

    return {
      fieldsFilled,
      fieldsKept,
      fieldsUpdated,
      keptExistingValues: fieldsKept.length > 0,
      provider,
      status,
    };
  }

  async assertCanComplete(profileId: string) {
    const status = await this.getStatus(profileId);

    if (!status.canContinue) {
      throw new Error("Provider enrichment must complete before onboarding can finish.");
    }
  }

  private async enrichWahoo(integration: IntegrationRow) {
    await this.writeSyncState(integration, "running", { blocking: true });

    const credentials = await this.getIntegrationCredentials(integration.id);
    if (!credentials) {
      await this.writeSyncState(
        integration,
        "failed",
        { blocking: true, provider_error_code: "missing_credentials" },
        "Integration credentials are unavailable.",
      );
      return;
    }

    const fieldsImported: ImportedOnboardingField[] = [];
    const client = createWahooClient({
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token ?? undefined,
    });

    try {
      const user = await withTimeout(
        client.getUserProfile(),
        WAHOO_ONBOARDING_REQUEST_TIMEOUT_MS,
        "Wahoo profile enrichment timed out",
      );
      const userImports = normalizeWahooUser(user);

      if (userImports.length > 0) {
        await this.writeCanonicalImports(integration, userImports);
        fieldsImported.push(...userImports.map((item) => item.field));
      }
    } catch (error) {
      await this.writeSyncState(
        integration,
        isTimeoutError(error) ? "timed_out" : "failed",
        {
          blocking: true,
          provider_error_code: getProviderErrorCode(error),
        },
        sanitizeProviderError(error),
      );
      return;
    }

    try {
      const powerZones = await withTimeout(
        client.getPowerZones(),
        WAHOO_ONBOARDING_REQUEST_TIMEOUT_MS,
        "Wahoo power-zone enrichment timed out",
      );
      const ftp = normalizeFtp(powerZones.ftp ?? powerZones.critical_power);

      if (ftp !== null) {
        fieldsImported.push("ftp");
      }

      await this.writeSyncState(integration, "succeeded", {
        blocking: true,
        fields_imported: fieldsImported,
        imported_values: ftp !== null ? { ftp } : undefined,
      });
    } catch (error) {
      await this.writeSyncState(
        integration,
        "partial",
        {
          blocking: true,
          fields_imported: fieldsImported,
          partial_reason: "Power zones unavailable.",
          provider_error_code: getProviderErrorCode(error),
        },
        sanitizeProviderError(error),
      );
    }
  }

  private async writeCanonicalImports(integration: IntegrationRow, imports: CanonicalImport[]) {
    const now = new Date();
    const profileUpdate: { dob?: Date; gender?: "male" | "female" | "other"; updated_at: Date } = {
      updated_at: now,
    };
    const weightImport = imports.find((item) => item.field === "weight_kg");

    for (const item of imports) {
      if (item.field === "dob" && typeof item.value === "string") {
        profileUpdate.dob = new Date(`${item.value}T00:00:00.000Z`);
      }
      if (
        item.field === "gender" &&
        (item.value === "male" || item.value === "female" || item.value === "other")
      ) {
        profileUpdate.gender = item.value;
      }
    }

    if (profileUpdate.dob || profileUpdate.gender) {
      await this.db
        .update(schema.profiles)
        .set(profileUpdate)
        .where(eq(schema.profiles.id, integration.profile_id));
    }

    if (weightImport && typeof weightImport.value === "number") {
      const notes = `Imported from ${getProviderLabel(integration.provider)}`;
      const [latestWeight] = await this.db
        .select({ value: schema.profileMetrics.value, notes: schema.profileMetrics.notes })
        .from(schema.profileMetrics)
        .where(
          and(
            eq(schema.profileMetrics.profile_id, integration.profile_id),
            eq(schema.profileMetrics.metric_type, "weight_kg"),
          ),
        )
        .orderBy(desc(schema.profileMetrics.recorded_at))
        .limit(1);

      if (latestWeight?.value === weightImport.value && latestWeight.notes === notes) return;

      await this.db.insert(schema.profileMetrics).values({
        id: randomUUID(),
        created_at: now,
        updated_at: now,
        profile_id: integration.profile_id,
        metric_type: "weight_kg",
        recorded_at: now,
        unit: "kg",
        value: weightImport.value,
        notes,
      });
    }
  }

  private async writeMissingCanonicalImports(
    integration: IntegrationRow,
    imports: CanonicalImport[],
  ): Promise<{
    fieldsFilled: ImportedOnboardingField[];
    fieldsKept: ImportedOnboardingField[];
    fieldsUpdated: ImportedOnboardingField[];
    keptExistingValues: boolean;
  }> {
    const now = new Date();
    const fieldsFilled: ImportedOnboardingField[] = [];
    const fieldsKept: ImportedOnboardingField[] = [];
    const fieldsUpdated: ImportedOnboardingField[] = [];
    const [profile] = await this.db
      .select({ dob: schema.profiles.dob, gender: schema.profiles.gender })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, integration.profile_id))
      .limit(1);
    const profileUpdate: { dob?: Date; gender?: "male" | "female" | "other"; updated_at: Date } = {
      updated_at: now,
    };

    for (const item of imports) {
      if (item.field === "dob" && typeof item.value === "string") {
        const importedDob = new Date(`${item.value}T00:00:00.000Z`);
        if (!profile?.dob) {
          profileUpdate.dob = importedDob;
          fieldsFilled.push("dob");
        } else if (profile.dob.getTime() !== importedDob.getTime()) {
          fieldsKept.push("dob");
        }
      }

      if (
        item.field === "gender" &&
        (item.value === "male" || item.value === "female" || item.value === "other")
      ) {
        if (!profile?.gender) {
          profileUpdate.gender = item.value;
          fieldsFilled.push("gender");
        } else if (profile.gender !== item.value) {
          fieldsKept.push("gender");
        }
      }
    }

    if (profileUpdate.dob || profileUpdate.gender) {
      await this.db
        .update(schema.profiles)
        .set(profileUpdate)
        .where(eq(schema.profiles.id, integration.profile_id));
    }

    const weightImport = imports.find((item) => item.field === "weight_kg");
    if (weightImport && typeof weightImport.value === "number") {
      const didWriteWeight = await this.writeProviderMetric(
        integration,
        "weight_kg",
        weightImport.value,
        "kg",
        now,
      );
      if (didWriteWeight.wrote && !didWriteWeight.hadExisting) {
        fieldsFilled.push("weight_kg");
      }

      if (didWriteWeight.wrote) {
        fieldsUpdated.push("weight_kg");
      }
    }

    return { fieldsFilled, fieldsKept, fieldsUpdated, keptExistingValues: fieldsKept.length > 0 };
  }

  private async writeProviderMetric(
    integration: IntegrationRow,
    metricType: "weight_kg" | "ftp",
    value: number,
    unit: string,
    recordedAt: Date,
  ) {
    const notes = `Imported from ${getProviderLabel(integration.provider)}`;
    const [latestMetric] = await this.db
      .select({ value: schema.profileMetrics.value, notes: schema.profileMetrics.notes })
      .from(schema.profileMetrics)
      .where(
        and(
          eq(schema.profileMetrics.profile_id, integration.profile_id),
          eq(schema.profileMetrics.metric_type, metricType),
        ),
      )
      .orderBy(desc(schema.profileMetrics.recorded_at))
      .limit(1);

    if (latestMetric?.value === value && latestMetric.notes === notes) {
      return { hadExisting: true, wrote: false };
    }

    await this.db.insert(schema.profileMetrics).values({
      id: randomUUID(),
      created_at: recordedAt,
      updated_at: recordedAt,
      profile_id: integration.profile_id,
      metric_type: metricType,
      recorded_at: recordedAt,
      unit,
      value,
      notes,
    });

    return { hadExisting: Boolean(latestMetric), wrote: true };
  }

  private async writeModeledCyclingEffortsFromFtp(profileId: string, ftp: number) {
    const recentCutoff = new Date(
      Date.now() - RECENT_REAL_EFFORT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const [recentRealBikePowerEffort] = await this.db
      .select({ id: schema.activityEfforts.id })
      .from(schema.activityEfforts)
      .where(
        and(
          eq(schema.activityEfforts.profile_id, profileId),
          eq(schema.activityEfforts.activity_category, "bike"),
          eq(schema.activityEfforts.effort_type, "power"),
          gte(schema.activityEfforts.recorded_at, recentCutoff),
          isNotNull(schema.activityEfforts.activity_id),
        ),
      )
      .limit(1);

    if (recentRealBikePowerEffort) return;

    await batchInsertActivityEfforts(
      this.db,
      profileId,
      deriveEffortsForSport("cycling", ftp),
      "provider_wahoo_ftp",
      null,
    );
  }

  private async getImportedFieldSources(profileId: string) {
    const integrations = await this.getConnectedIntegrations(profileId);
    if (integrations.length === 0)
      return new Map<
        ImportedOnboardingField,
        {
          provider: PublicIntegrationProvider;
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
          eq(schema.providerSyncState.resource, ONBOARDING_ENRICHMENT_RESOURCE),
        ),
      );

    const integrationById = new Map(
      integrations.map((integration) => [integration.id, integration]),
    );
    const sources = new Map<
      ImportedOnboardingField,
      {
        provider: PublicIntegrationProvider;
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
            provider: integration.provider,
            recordedAt: row.last_sync_succeeded_at?.toISOString() ?? null,
            value: metadata.imported_values?.[field],
          });
        }
      }
    }

    return sources;
  }

  private async writeSyncState(
    integration: IntegrationRow,
    status: OnboardingProviderItemStatus,
    metadata: SyncMetadata,
    lastError?: string,
  ) {
    const now = new Date();
    const isSuccess = [
      "succeeded",
      "partial",
      "skipped_unsupported",
      "requirement_cleared",
    ].includes(status);
    const isFailure = ["failed", "timed_out"].includes(status);

    try {
      await this.db
        .insert(schema.providerSyncState)
        .values({
          integration_id: integration.id,
          provider: integration.provider,
          resource: ONBOARDING_ENRICHMENT_RESOURCE,
          sync_mode: ONBOARDING_SYNC_MODE,
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
            sync_mode: ONBOARDING_SYNC_MODE,
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
      console.warn("Failed to write onboarding provider sync state", error);
    }
  }

  private async writeSetupRefreshState(
    integration: IntegrationRow,
    status: "running" | "succeeded" | "partial" | "failed",
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

  private async getConnectedIntegrations(
    profileId: string,
    selectedProviders?: PublicIntegrationProvider[],
  ) {
    const conditions = [eq(schema.integrations.profile_id, profileId)];

    if (selectedProviders && selectedProviders.length > 0) {
      conditions.push(inArray(schema.integrations.provider, selectedProviders));
    }

    return await this.db
      .select()
      .from(schema.integrations)
      .where(and(...conditions));
  }

  private async getConnectedIntegration(profileId: string, provider: PublicIntegrationProvider) {
    const [integration] = await this.db
      .select()
      .from(schema.integrations)
      .where(
        and(
          eq(schema.integrations.profile_id, profileId),
          eq(schema.integrations.provider, provider),
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

function normalizeWahooUser(user: WahooUser) {
  const suggestions: Array<{
    field: ImportedOnboardingField;
    value: ImportedOnboardingValue;
  }> = [];

  if (isDateOnlyString(user.birth)) {
    suggestions.push({ field: "dob", value: user.birth });
  }

  const gender = normalizeWahooGender(user.gender);
  if (gender) {
    suggestions.push({ field: "gender", value: gender });
  }

  const weight = normalizeWeight(user.weight);
  if (weight !== null) {
    suggestions.push({ field: "weight_kg", value: weight });
  }

  return suggestions;
}

function normalizeWahooGender(gender: number) {
  if (gender === 0) return "male";
  if (gender === 1) return "female";
  if (gender === 2) return "other";
  return null;
}

function normalizeWeight(weight: number) {
  return Number.isFinite(weight) && weight >= 30 && weight <= 300 ? weight : null;
}

function normalizeFtp(ftp: number | null | undefined) {
  return typeof ftp === "number" && Number.isFinite(ftp) && ftp >= 50 && ftp <= 500
    ? Math.round(ftp)
    : null;
}

function isDateOnlyString(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function parseSyncMetadata(value: unknown): SyncMetadata {
  return value && typeof value === "object" ? (value as SyncMetadata) : {};
}

function getProviderLabel(provider: PublicIntegrationProvider) {
  return provider === "wahoo" ? "Wahoo" : provider;
}

function getProviderStatusMessage(status: OnboardingProviderItemStatus, metadata: SyncMetadata) {
  if (status === "skipped_unsupported")
    return "Setup import is not available for this provider yet.";
  if (status === "partial")
    return metadata.partial_reason ?? "Some provider fields were unavailable.";
  if (status === "failed") return "Provider setup sync failed.";
  if (status === "requirement_cleared") return "Skipped for onboarding.";
  return undefined;
}

function getProviderErrorCode(error: unknown) {
  const wahooError = error as WahooApiError;
  if (wahooError.status === 403) return "missing_scope";
  if (wahooError.status === 401) return "auth_failed";
  if (wahooError.status === 429) return "rate_limited";
  return wahooError.code ?? "provider_error";
}

function sanitizeProviderError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Provider request failed";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new ProviderTimeoutError(message)), timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

class ProviderTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderTimeoutError";
  }
}

function isTimeoutError(error: unknown) {
  return error instanceof ProviderTimeoutError;
}

function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}
