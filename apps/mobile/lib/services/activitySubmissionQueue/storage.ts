import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ActivitySubmissionQueueJob } from "./types";

const ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY = "activity-submission-queue:jobs";

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
    await AsyncStorage.removeItem(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY);
    return [];
  }
}

export async function saveActivitySubmissionQueueJobs(
  jobs: ActivitySubmissionQueueJob[],
): Promise<void> {
  await AsyncStorage.setItem(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY, JSON.stringify(jobs));
}

export async function upsertActivitySubmissionQueueJob(
  job: ActivitySubmissionQueueJob,
): Promise<void> {
  const jobs = await loadActivitySubmissionQueueJobs();
  const index = jobs.findIndex((candidate) => candidate.id === job.id);

  if (index >= 0) {
    jobs[index] = job;
  } else {
    jobs.push(job);
  }

  await saveActivitySubmissionQueueJobs(jobs);
}

export async function removeActivitySubmissionQueueJob(id: string): Promise<void> {
  const jobs = await loadActivitySubmissionQueueJobs();
  await saveActivitySubmissionQueueJobs(jobs.filter((job) => job.id !== id));
}

export async function clearActivitySubmissionQueueJobs(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVITY_SUBMISSION_QUEUE_JOBS_KEY);
}
