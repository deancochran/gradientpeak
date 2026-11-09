import type { DrizzleDbClient } from "@repo/db";
import { createStravaRepository } from "../../infrastructure/repositories";
import { createActivityImportRepository } from "../../repositories/activity-import-repository";
import { getActivityArtifactStorageService } from "../../storage-service";
import { StravaActivityHistoryJobService } from "./strava-activity-history-job-service";
import { StravaCompletedActivityUploadJobService } from "./strava-completed-activity-upload-job-service";
import { StravaWebhookJobService } from "./strava-webhook-job-service";

/** Package-owned local worker composition; scheduling and HTTP route policy remain app-owned. */
export function createStravaProviderRuntime(db: DrizzleDbClient) {
  const repository = createStravaRepository({ db });
  return {
    activityHistoryJobs: new StravaActivityHistoryJobService({
      db,
      importRuns: createActivityImportRepository(db),
      repository,
    }),
    completedActivityUploadJobs: new StravaCompletedActivityUploadJobService({
      artifactStorage: getActivityArtifactStorageService(),
      db,
      repository,
    }),
    webhookJobs: new StravaWebhookJobService({ db, repository }),
    repository,
  };
}
