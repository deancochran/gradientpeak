import { createHash } from "node:crypto";
import type { TestInfo } from "@playwright/test";

type ExecutionCoordinates = Pick<
  TestInfo,
  "parallelIndex" | "repeatEachIndex" | "retry" | "testId" | "titlePath" | "workerIndex"
> & { processId?: number; project: Pick<TestInfo["project"], "name"> };

export type E2EExecutionIdentity = ReturnType<typeof createE2EExecutionIdentity>;

export function createE2EExecutionIdentity(testInfo: ExecutionCoordinates) {
  const provenance = [
    testInfo.project.name,
    testInfo.testId,
    ...testInfo.titlePath,
    `process-${testInfo.processId ?? process.pid}`,
    `worker-${testInfo.workerIndex}`,
    `parallel-${testInfo.parallelIndex}`,
    `repeat-${testInfo.repeatEachIndex}`,
    `retry-${testInfo.retry}`,
  ].join("|");
  const digestFor = (label: string) =>
    createHash("sha256").update(`${provenance}|${label}`).digest("hex");

  return {
    provenance,
    suffix(label: string, length = 12) {
      if (length < 4 || length > 64) throw new Error("E2E identity suffix length must be 4-64.");
      return digestFor(label).slice(0, length);
    },
    name(label: string) {
      return `${label.trim()} ${digestFor(label).slice(0, 12)}`;
    },
    slug(label: string) {
      const prefix = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      return `${prefix || "e2e"}-${digestFor(label).slice(0, 12)}`;
    },
    uuid(label: string) {
      const digest = digestFor(label);
      return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    },
    calendarDate(label: string, offsetDays = 0) {
      const spread = Number.parseInt(digestFor(label).slice(0, 8), 16) % 365;
      return addUtcDays("2027-01-04", spread + offsetDays);
    },
  } as const;
}

export function addUtcDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid E2E calendar date: ${date}`);
  }
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function utcDateTime(date: string, time = "09:00:00") {
  const value = new Date(`${date}T${time}.000Z`);
  if (Number.isNaN(value.getTime()))
    throw new Error(`Invalid E2E calendar date/time: ${date} ${time}`);
  return value.toISOString();
}
