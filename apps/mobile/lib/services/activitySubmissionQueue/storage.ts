import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ActivitySubmissionQueueJob } from "./types";

const ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY = "activity-submission-queue:jobs";
let queueMutation: Promise<void> = Promise.resolve();

function serializeQueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = queueMutation.then(mutation, mutation);
  queueMutation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function loadActivitySubmissionQueueJobs(): Promise<ActivitySubmissionQueueJob[]> {
  const raw = await AsyncStorage.getItem(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ActivitySubmissionQueueJob[]) : [];
  } catch (error) {
    console.warn("[activitySubmissionQueue] Failed to parse queue jobs", error);
    throw new Error("Stored activity submission queue is unreadable", { cause: error });
  }
}

export async function loadActivitySubmissionQueueJobByArtifactId(
  artifactId: string,
): Promise<ActivitySubmissionQueueJob | null> {
  const jobs = await loadActivitySubmissionQueueJobs();
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
  await AsyncStorage.setItem(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY, JSON.stringify(jobs));
}

export async function upsertActivitySubmissionQueueJob(
  job: ActivitySubmissionQueueJob,
): Promise<void> {
  return serializeQueueMutation(async () => {
    const jobs = await loadActivitySubmissionQueueJobs();
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
    const jobs = await loadActivitySubmissionQueueJobs();
    await saveActivitySubmissionQueueJobs(jobs.filter((job) => job.id !== id));
  });
}

export async function clearActivitySubmissionQueueJobs(): Promise<void> {
  return serializeQueueMutation(() => AsyncStorage.removeItem(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY));
}
