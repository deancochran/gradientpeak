import { randomUUID } from "node:crypto";
import type { ProviderSyncJobRecord } from "../../repositories";
import { logger } from "../logger";

export type ProviderSyncJobOutcome = "completed" | "failed" | "dead_lettered";
export type ProviderSyncExecutionContext = { signal: AbortSignal };

export type ProviderSyncExecutionTelemetry = {
  attempts: number;
  completed: number;
  endingDeadLetterDepth: number;
  deadLettered: number;
  durationMs: number;
  failed: number;
  jobFamily: string;
  endingMaxQueueAgeMs: number;
  processed: number;
  provider: string;
  endingQueueDepth: number;
  staleLocksRecovered: number;
};

export interface ProviderSyncTelemetry {
  recordExecution(telemetry: ProviderSyncExecutionTelemetry): void;
}

export class ProviderSyncConcurrencyLimiter {
  private reserved = 0;

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1)
      throw new Error("Concurrency limit must be positive");
  }

  reserve(requested: number): number {
    const granted = Math.min(Math.max(0, Math.floor(requested)), this.limit - this.reserved);
    this.reserved += granted;
    return granted;
  }

  release(count: number): void {
    this.reserved = Math.max(0, this.reserved - count);
  }
}

let processProviderSyncLimiter: ProviderSyncConcurrencyLimiter | undefined;

export function getProcessProviderSyncLimiter(limit: number): ProviderSyncConcurrencyLimiter {
  processProviderSyncLimiter ??= new ProviderSyncConcurrencyLimiter(limit);
  return processProviderSyncLimiter;
}

export function createProviderSyncWorkerId(prefix: string): string {
  return `${prefix}:${randomUUID()}`;
}

export const providerSyncTelemetry: ProviderSyncTelemetry = {
  recordExecution(telemetry) {
    const write = telemetry.deadLettered > 0 ? logger.warn : logger.info;
    write("Provider sync drain completed", telemetry);
  },
};

function orderedLaneJobs(jobs: ProviderSyncJobRecord[]): ProviderSyncJobRecord[][] {
  const lanes = new Map<string, ProviderSyncJobRecord[]>();
  for (const job of jobs) {
    const lane = job.syncLaneKey ?? `unlaned:${job.id}`;
    const laneJobs = lanes.get(lane) ?? [];
    laneJobs.push(job);
    lanes.set(lane, laneJobs);
  }

  return [...lanes.values()].map((laneJobs) =>
    laneJobs.sort(
      (left, right) =>
        (left.queueSequence ?? Number.MAX_SAFE_INTEGER) -
        (right.queueSequence ?? Number.MAX_SAFE_INTEGER),
    ),
  );
}

/** Runs lanes concurrently while preserving strict FIFO execution inside each lane. */
export async function executeProviderSyncJobs(input: {
  concurrency: number;
  getEndingQueueTelemetry?: () => Promise<{
    deadLetterDepth: number;
    oldestDueAt: string | null;
    queueDepth: number;
  }>;
  jobFamily: string;
  jobs: ProviderSyncJobRecord[];
  leaseRenewIntervalMs?: number;
  now?: () => number;
  processJob: (
    job: ProviderSyncJobRecord,
    context: ProviderSyncExecutionContext,
  ) => Promise<ProviderSyncJobOutcome>;
  provider: string;
  renewLease?: (job: ProviderSyncJobRecord) => Promise<boolean>;
  telemetry?: ProviderSyncTelemetry;
}): Promise<{ completed: number; failed: number; processed: number }> {
  const startedAt = (input.now ?? Date.now)();
  const laneQueue = orderedLaneJobs(input.jobs);
  const workerCount = Math.min(Math.max(1, Math.floor(input.concurrency)), laneQueue.length);
  let completed = 0;
  let deadLettered = 0;
  let failed = 0;

  async function worker() {
    while (laneQueue.length > 0) {
      const laneJobs = laneQueue.shift();
      if (!laneJobs) return;
      for (const job of laneJobs) {
        const lease = new AbortController();
        let renewal: ReturnType<typeof setInterval> | undefined;
        let renewalInFlight = false;
        if (input.renewLease && input.leaseRenewIntervalMs) {
          renewal = setInterval(() => {
            if (renewalInFlight || lease.signal.aborted) return;
            renewalInFlight = true;
            input
              .renewLease?.(job)
              .then((renewed) => {
                if (!renewed) lease.abort(new Error("Provider sync lease ownership lost"));
              })
              .catch(() => {
                lease.abort(new Error("Provider sync lease renewal failed"));
                logger.warn("Provider sync lease renewal failed", {
                  jobFamily: input.jobFamily,
                  provider: input.provider,
                });
              })
              .finally(() => {
                renewalInFlight = false;
              });
          }, input.leaseRenewIntervalMs);
        }
        let outcome = await input.processJob(job, { signal: lease.signal }).finally(() => {
          if (renewal) clearInterval(renewal);
        });
        if (lease.signal.aborted) outcome = "failed";
        if (outcome === "completed") completed += 1;
        else {
          failed += 1;
          if (outcome === "dead_lettered") deadLettered += 1;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const finishedAt = (input.now ?? Date.now)();
  const endingQueueTelemetry = await input.getEndingQueueTelemetry?.();
  (input.telemetry ?? providerSyncTelemetry).recordExecution({
    attempts: input.jobs.reduce((sum, job) => sum + job.attempt, 0),
    completed,
    endingDeadLetterDepth: endingQueueTelemetry?.deadLetterDepth ?? deadLettered,
    deadLettered,
    durationMs: Math.max(0, finishedAt - startedAt),
    failed,
    jobFamily: input.jobFamily,
    endingMaxQueueAgeMs: endingQueueTelemetry?.oldestDueAt
      ? Math.max(0, finishedAt - Date.parse(endingQueueTelemetry.oldestDueAt))
      : 0,
    processed: input.jobs.length,
    provider: input.provider,
    endingQueueDepth: endingQueueTelemetry?.queueDepth ?? 0,
    staleLocksRecovered: input.jobs.filter((job) => job.staleLockRecovered).length,
  });

  return { completed, failed, processed: input.jobs.length };
}
