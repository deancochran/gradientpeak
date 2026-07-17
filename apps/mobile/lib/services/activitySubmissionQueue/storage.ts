import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { type ActivitySubmissionQueueJob, activitySubmissionQueueJobSchema } from "./types";

export const ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY = "activity-submission-queue:v3:jobs";
let queueMutation: Promise<void> = Promise.resolve();

function serializeQueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = queueMutation.then(mutation, mutation);
  queueMutation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function loadAllActivitySubmissionQueueJobs(): Promise<ActivitySubmissionQueueJob[]> {
  const raw = await AsyncStorage.getItem(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY);

  if (!raw) {
    return [];
  }

  try {
    return z.array(activitySubmissionQueueJobSchema).parse(JSON.parse(raw));
  } catch (error) {
    console.warn("Queue parse failed", error);
    throw new Error("Stored activity submission queue is unreadable", { cause: error });
  }
}

export async function loadActivitySubmissionQueueJobs(
  profileId?: string,
): Promise<ActivitySubmissionQueueJob[]> {
  const jobs = await loadAllActivitySubmissionQueueJobs();
  return profileId ? jobs.filter((job) => job.draft.profileId === profileId) : jobs;
}

export async function loadActivitySubmissionQueueJobByArtifactId(
  artifactId: string,
  profileId?: string,
): Promise<ActivitySubmissionQueueJob | null> {
  const jobs = await loadActivitySubmissionQueueJobs(profileId);
  return (
    jobs.find(
      (job) =>
        job.id === artifactId || job.artifactId === artifactId || job.sessionId === artifactId,
    ) ?? null
  );
}

export function incompleteQueueJobReferencesLocalFiles(job: ActivitySubmissionQueueJob): boolean {
  return (
    job.status !== "complete" &&
    Boolean(job.localActivityFilePath || (job.streamArtifactPaths?.length ?? 0) > 0)
  );
}

export async function saveActivitySubmissionQueueJobs(
  jobs: ActivitySubmissionQueueJob[],
): Promise<void> {
  const parsed = z.array(activitySubmissionQueueJobSchema).parse(jobs);
  await AsyncStorage.setItem(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY, JSON.stringify(parsed));
}

export async function upsertActivitySubmissionQueueJob(
  job: ActivitySubmissionQueueJob,
): Promise<void> {
  return serializeQueueMutation(async () => {
    const jobs = await loadAllActivitySubmissionQueueJobs();
    const index = jobs.findIndex((candidate) => candidate.id === job.id);

    if (index >= 0) {
      jobs[index] = job;
    } else {
      jobs.push(job);
    }

    await saveActivitySubmissionQueueJobs(jobs);
  });
}

export async function removeActivitySubmissionQueueJob(id: string): Promise<void> {
  return serializeQueueMutation(async () => {
    const jobs = await loadAllActivitySubmissionQueueJobs();
    await saveActivitySubmissionQueueJobs(jobs.filter((job) => job.id !== id));
  });
}

export async function clearActivitySubmissionQueueJobs(): Promise<void> {
  return serializeQueueMutation(() => AsyncStorage.removeItem(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY));
}
