import {
  publicActivitiesRowSchema,
  publicActivityPlansRowSchema,
  publicActivityRoutesRowSchema,
  publicEventsRowSchema,
  publicIntegrationResourceLinksRowSchema,
  publicIntegrationsRowSchema,
  publicOAuthStatesRowSchema,
  publicProfileMetricsRowSchema,
  publicProfilesRowSchema,
  publicProviderSyncJobsRowSchema,
  publicProviderSyncStateRowSchema,
  publicProviderWebhookReceiptsRowSchema,
  publicTrainingPlansRowSchema,
} from "@repo/db";
import { describe, expect, it } from "vitest";

describe("idx compatibility contracts", () => {
  it("does not expose redundant idx fields through public database-backed API contracts", () => {
    const schemas = [
      publicProfilesRowSchema,
      publicActivityRoutesRowSchema,
      publicActivityPlansRowSchema,
      publicTrainingPlansRowSchema,
      publicEventsRowSchema,
      publicActivitiesRowSchema,
      publicIntegrationsRowSchema,
      publicOAuthStatesRowSchema,
      publicIntegrationResourceLinksRowSchema,
      publicProviderSyncStateRowSchema,
      publicProviderWebhookReceiptsRowSchema,
    ];

    for (const schema of schemas) {
      expect(schema.shape).not.toHaveProperty("idx");
    }
  });

  it("names provider queue order explicitly and retains the metric insertion tie-breaker", () => {
    expect(publicProviderSyncJobsRowSchema.shape).not.toHaveProperty("idx");
    expect(publicProviderSyncJobsRowSchema.shape).toHaveProperty("queue_sequence");
    expect(publicProfileMetricsRowSchema.shape).toHaveProperty("idx");
  });
});
