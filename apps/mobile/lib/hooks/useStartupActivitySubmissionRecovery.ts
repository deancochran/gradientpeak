import { useEffect } from "react";
import { api } from "@/lib/api";
import { runActivitySubmissionQueueJob } from "@/lib/services/activitySubmissionQueue";
import { ActivityFileUploader } from "@/lib/services/fit/ActivityFileUploader";
import { prepareMobileRecordingStartup } from "@/lib/services/mobileRecordingStartup";

/** Drains durable jobs once per authenticated app bootstrap; the runner deduplicates in-flight jobs. */
export function useStartupActivitySubmissionRecovery(profileId: string | null): void {
  const create = api.activities.createFromRecordingSummary.useMutation();
  const signedUrl = api.activityFiles.getSignedUploadUrl.useMutation();
  const process = api.activityFiles.markUploadedAndProcess.useMutation();

  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    void prepareMobileRecordingStartup(profileId)
      .then(async ({ queueJobs: jobs }) => {
        const uploader = new ActivityFileUploader();
        for (const job of jobs) {
          if (cancelled || job.status === "complete" || job.draft.profileId !== profileId) continue;
          await runActivitySubmissionQueueJob(job, {
            createFromRecordingSummary: create.mutateAsync,
            getSignedUploadUrl: (input) =>
              signedUrl.mutateAsync({ fileName: input.fileName, fileSize: input.fileSize ?? 0 }),
            uploadToSignedUrl: (path, url) => uploader.uploadToSignedUrl(path, url),
            markUploadedAndProcess: process.mutateAsync,
          });
        }
      })
      .catch((error) => console.warn("Failed to recover activity submissions", error));
    return () => {
      cancelled = true;
    };
  }, [profileId, create.mutateAsync, signedUrl.mutateAsync, process.mutateAsync]);
}
