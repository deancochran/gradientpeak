import { invalidatePostActivityIngestionQueries } from "@repo/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { runActivitySubmissionQueueJob } from "@/lib/services/activitySubmissionQueue";
import { getLocalActivityArtifactMetadata } from "@/lib/services/activitySubmissionQueue/localArtifact";
import { ActivityFileUploader } from "@/lib/services/fit/ActivityFileUploader";
import { prepareMobileRecordingStartup } from "@/lib/services/mobileRecordingStartup";

/** Drains durable jobs once per authenticated app bootstrap; the runner deduplicates in-flight jobs. */
export function useStartupActivitySubmissionRecovery(profileId: string | null): void {
  const queryClient = useQueryClient();
  const create = api.activities.createFromRecordingSummary.useMutation();
  const beginUpload = api.activityFiles.beginMobileRecordingUpload.useMutation();
  const retryRecordingCleanup = api.activityFiles.retryPendingMobileRecordingCleanup.useMutation();

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    void retryRecordingCleanup.mutateAsync({ limit: 10 }).catch(() => undefined);
    void prepareMobileRecordingStartup(profileId)
      .then(async ({ queueJobs: jobs }) => {
        const uploader = new ActivityFileUploader();
        let recoveredSubmission = false;
        for (const job of jobs) {
          if (cancelled || job.status === "complete" || job.draft.profileId !== profileId) continue;
          const result = await runActivitySubmissionQueueJob(job, {
            createFromRecordingSummary: create.mutateAsync,
            getLocalArtifactMetadata: getLocalActivityArtifactMetadata,
            beginMobileRecordingUpload: beginUpload.mutateAsync,
            uploadToSignedUrl: (path, url) => uploader.uploadToSignedUrl(path, url),
          });
          recoveredSubmission ||= result.status === "complete";
        }
        if (!cancelled && recoveredSubmission) {
          await invalidatePostActivityIngestionQueries(queryClient);
        }
      })
      .catch((error) => console.warn("Failed to recover activity submissions", error));
    return () => {
      cancelled = true;
    };
  }, [
    profileId,
    create.mutateAsync,
    beginUpload.mutateAsync,
    retryRecordingCleanup.mutateAsync,
    queryClient,
  ]);
}
