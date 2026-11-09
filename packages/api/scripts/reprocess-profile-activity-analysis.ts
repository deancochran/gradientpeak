#!/usr/bin/env tsx

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  type ProfileActivityAnalysisReprocessInput,
  reprocessProfileActivityAnalysis,
} from "../src/application/activity-analysis/reprocess-profile-activity-analysis";

const uuidSchema = z.string().uuid();

export type ManualProfileActivityAnalysisCliInput = ProfileActivityAnalysisReprocessInput;

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseDate(value: string, flag: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${flag} must be a valid ISO timestamp`);
  return date;
}

export function parseManualProfileActivityAnalysisArgs(
  args: string[],
): ManualProfileActivityAnalysisCliInput {
  let profileId: string | undefined;
  let confirmProfileId: string | undefined;
  let from: Date | undefined;
  let to: Date | undefined;
  let apply = false;
  let explicitDryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--profile-id") {
      profileId = uuidSchema.parse(valueAfter(args, index, flag));
      index += 1;
    } else if (flag === "--confirm-profile-id") {
      confirmProfileId = uuidSchema.parse(valueAfter(args, index, flag));
      index += 1;
    } else if (flag === "--from") {
      from = parseDate(valueAfter(args, index, flag), flag);
      index += 1;
    } else if (flag === "--to") {
      to = parseDate(valueAfter(args, index, flag), flag);
      index += 1;
    } else if (flag === "--apply") {
      apply = true;
    } else if (flag === "--dry-run") {
      explicitDryRun = true;
    } else {
      throw new Error(`Unknown argument: ${flag ?? ""}`);
    }
  }
  if (!profileId) throw new Error("--profile-id is required");
  if (apply && explicitDryRun) throw new Error("--apply and --dry-run cannot be combined");
  if (apply && confirmProfileId !== profileId) {
    throw new Error("--apply requires --confirm-profile-id to exactly match --profile-id");
  }
  if (!apply && confirmProfileId !== undefined) {
    throw new Error("--confirm-profile-id is only valid with --apply");
  }
  if (from && to && from >= to) throw new Error("--from must be before --to");
  return {
    profileId,
    apply,
    ...(confirmProfileId ? { confirmProfileId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

export async function runManualProfileActivityAnalysisReprocess(args: string[]) {
  const input = parseManualProfileActivityAnalysisArgs(args);
  const { db, pool } = await import("@repo/db/client");
  try {
    const result = await reprocessProfileActivityAnalysis(db, input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.athleteStateRebuild === "blocked" || result.athleteStateRebuild === "failed") {
      process.exitCode = 1;
    }
    return result;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runManualProfileActivityAnalysisReprocess(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Reprocess failed"}\n`);
    process.exitCode = 1;
  });
}
