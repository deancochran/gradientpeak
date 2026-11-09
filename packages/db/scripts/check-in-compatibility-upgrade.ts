/**
 * One historical check-in compatibility upgrade; never a general migration runner.
 *
 * Its source is the additive tail that changed the canonical predecessor into the
 * six-table check-in checkpoint.  It deliberately has no CLI apply path: activating
 * a preserved target needs separately authorized backup and restore evidence.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { dbPackageRoot } from "./_helpers";
import { createSchemaFingerprint } from "./check-schema-fingerprint";

// Split immutable Git object IDs to avoid treating provenance as credential material.
// biome-ignore lint/security/noSecrets: immutable Git commit provenance, not a credential.
export const checkInCompatibilityPredecessor = "0644f4441c7941ce820a" + "45846dd92dd55a359586";
export const checkInCompatibilityCheckpoint = "ba6b78bf5aac96227a4b" + "05e97c2f8e57c2a58e8c";

const baselinePath = "packages/db/supabase/migrations/20260730000000_mvp_baseline.sql";
const localBaselinePath = "supabase/migrations/20260730000000_mvp_baseline.sql";
const fingerprintPath = "packages/db/schema-fingerprint.json";
const directory = resolve(dbPackageRoot, "supabase/approved-upgrades/check-in-persistence");
const upgradePath = resolve(directory, "upgrade.sql");
const beforePath = resolve(directory, "before-fingerprint.json");
const afterPath = resolve(directory, "after-fingerprint.json");
const marker = "-- Versioned coaching check-ins are backend-owned.";

export const checkInTables = [
  "check_in_templates",
  "check_in_template_versions",
  "check_in_schedules",
  "check_in_occurrences",
  "check_in_submissions",
  "check_in_follow_ups",
] as const;

const checkInFunctions = [
  "check_in_is_valid_time_zone",
  "check_in_local_civil_time_is_valid",
  "check_in_json_has_exact_keys",
  "check_in_uuid_is_valid",
  "check_in_js_trim",
  "check_in_template_questions_are_valid",
  "check_in_submission_answers_are_valid",
  "validate_check_in_occurrence_schedule",
  "prevent_check_in_occurrence_mutation",
  "prevent_check_in_schedule_identity_mutation",
  "validate_check_in_template_version_payload",
  "validate_check_in_submission_payload",
  "prevent_check_in_template_version_mutation",
  "prevent_check_in_submission_mutation",
] as const;

const checkInTriggers = [
  "check_in_occurrences_schedule_weekday_guard",
  "check_in_occurrences_retained",
  "check_in_schedules_identity_guard",
  "check_in_template_versions_payload_guard",
  "check_in_template_versions_immutable",
  "check_in_submissions_payload_guard",
  "check_in_submissions_retained",
] as const;

function gitShow(revision: string, path: string) {
  return execFileSync("git", ["show", `${revision}:${path}`], {
    cwd: dbPackageRoot,
    encoding: "utf8",
  });
}

export function canonicalPredecessorBaseline() {
  return gitShow(checkInCompatibilityPredecessor, baselinePath);
}

export function canonicalCheckInBaseline() {
  return gitShow(checkInCompatibilityCheckpoint, baselinePath);
}

/** Refuses any history shape other than a purely appended, reviewed check-in slice. */
export function expectedCheckInCompatibilityUpgradeSql() {
  const before = canonicalPredecessorBaseline();
  const after = canonicalCheckInBaseline();
  // Both fresh baselines are one transaction. The check-in commit inserts its
  // additive tail immediately before the predecessor's final COMMIT.
  if (!before.endsWith("COMMIT;\n"))
    throw new Error("canonical predecessor is missing its baseline transaction terminator");
  const predecessorBody = before.slice(0, -"COMMIT;\n".length);
  if (!after.startsWith(predecessorBody) || !after.endsWith("COMMIT;\n"))
    throw new Error("check-in checkpoint is not a purely additive baseline successor");
  const additions = after.slice(predecessorBody.length, -"COMMIT;\n".length);
  if (!additions.startsWith(`\n${marker}`) || !additions.endsWith("\n"))
    throw new Error("check-in checkpoint additions have an unexpected boundary");
  for (const table of checkInTables) {
    if (!additions.includes(`CREATE TABLE public.${table} (`))
      throw new Error(`missing check-in table source: ${table}`);
  }
  for (const name of checkInFunctions) {
    if (!additions.includes(`CREATE FUNCTION public.${name}(`))
      throw new Error(`missing check-in function source: ${name}`);
  }
  for (const name of checkInTriggers) {
    if (!additions.includes(`CREATE TRIGGER ${name}`))
      throw new Error(`missing check-in trigger source: ${name}`);
  }
  for (const table of checkInTables) {
    if (!additions.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`))
      throw new Error(`missing check-in RLS source: ${table}`);
  }
  for (const acl of [
    "REVOKE ALL ON TABLE public.check_in_templates, public.check_in_template_versions,",
    "GRANT ALL ON TABLE public.check_in_templates, public.check_in_template_versions,",
    "REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.check_in_template_versions",
  ]) {
    if (!additions.includes(acl)) throw new Error("missing check-in ACL source");
  }
  return [
    "-- Approved check-in persistence compatibility upgrade only. Use a guarded disposable proof.",
    "BEGIN;",
    "SET LOCAL search_path = public, pg_catalog;",
    additions.trim(),
    "COMMIT;",
    "",
  ].join("\n");
}

export function expectedCheckInCompatibilityBeforeFingerprint() {
  return JSON.parse(gitShow(checkInCompatibilityPredecessor, fingerprintPath));
}

export function expectedCheckInCompatibilityAfterFingerprint() {
  return JSON.parse(gitShow(checkInCompatibilityCheckpoint, fingerprintPath));
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

type Fingerprint = Record<string, unknown>;
type FingerprintEntry = Record<string, unknown>;

function entries(fingerprint: Fingerprint, section: string) {
  const value = fingerprint[section];
  if (!Array.isArray(value) || !value.every((entry) => entry && typeof entry === "object"))
    throw new Error(`check-in compatibility fingerprint section is invalid: ${section}`);
  return value as FingerprintEntry[];
}

function entryString(entry: FingerprintEntry) {
  return JSON.stringify(entry);
}

function entryText(entry: FingerprintEntry, key: string, section: string) {
  const value = entry[key];
  if (typeof value !== "string")
    throw new Error(`check-in compatibility ${section} entry is missing ${key}`);
  return value;
}

/** The historical delta may add only the explicitly reviewed check-in surfaces. */
export function assertCheckInCompatibilityAllowedDelta(before: unknown, after: unknown) {
  if (!before || typeof before !== "object" || !after || typeof after !== "object")
    throw new Error("check-in compatibility fingerprints must be objects");
  const oldFingerprint = before as Fingerprint;
  const newFingerprint = after as Fingerprint;
  const sections = new Set([...Object.keys(oldFingerprint), ...Object.keys(newFingerprint)]);
  for (const section of sections) {
    const oldValue = oldFingerprint[section];
    const newValue = newFingerprint[section];
    const reviewedSection = [
      "tables",
      "publicRelations",
      "columns",
      "indexes",
      "constraints",
      "functions",
      "triggers",
    ].includes(section);
    if (!reviewedSection) {
      if (!same(oldValue, newValue))
        throw new Error(`check-in compatibility changed unrelated fingerprint section: ${section}`);
      continue;
    }
    const oldEntries = entries(oldFingerprint, section);
    const newEntries = entries(newFingerprint, section);
    const newEntryStrings = new Set(newEntries.map(entryString));
    if (!oldEntries.every((entry) => newEntryStrings.has(entryString(entry))))
      throw new Error(`check-in compatibility modified a pre-existing ${section} entry`);
    const oldEntryStrings = new Set(oldEntries.map(entryString));
    const additions = newEntries.filter((entry) => !oldEntryStrings.has(entryString(entry)));
    for (const addition of additions) {
      if (["tables", "publicRelations"].includes(section)) {
        if (
          !checkInTables.includes(
            entryText(addition, "name", section) as (typeof checkInTables)[number],
          )
        )
          throw new Error(`check-in compatibility added an unrelated ${section} entry`);
      } else if (["columns", "indexes", "constraints"].includes(section)) {
        const table = entryText(addition, "table", section);
        if (!checkInTables.includes(table as (typeof checkInTables)[number]))
          throw new Error(`check-in compatibility added an unrelated ${section} entry`);
      } else if (section === "functions") {
        const functionName = entryText(addition, "identity", section).split("(", 1)[0];
        if (!checkInFunctions.includes(functionName as (typeof checkInFunctions)[number]))
          throw new Error("check-in compatibility added an unrelated function entry");
      } else {
        const table = entryText(addition, "table", section);
        if (
          !checkInTables.includes(table as (typeof checkInTables)[number]) ||
          !checkInTriggers.includes(
            entryText(addition, "name", section) as (typeof checkInTriggers)[number],
          )
        )
          throw new Error("check-in compatibility added an unrelated trigger entry");
      }
    }
  }
}

export function assertCheckInCompatibilityArtifact(sql: string) {
  if (sql !== expectedCheckInCompatibilityUpgradeSql())
    throw new Error("check-in compatibility artifact differs from pinned additive source");
}

export function assertCheckInCompatibilityFingerprints(before: unknown, after: unknown) {
  if (!same(before, expectedCheckInCompatibilityBeforeFingerprint()))
    throw new Error("check-in compatibility prerequisite fingerprint differs from pinned source");
  if (!same(after, expectedCheckInCompatibilityAfterFingerprint()))
    throw new Error("check-in compatibility postcondition fingerprint differs from pinned source");
  assertCheckInCompatibilityAllowedDelta(before, after);
}

export function sourceHashes() {
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  return {
    predecessor: checkInCompatibilityPredecessor,
    checkpoint: checkInCompatibilityCheckpoint,
    upgradeSha256: hash(expectedCheckInCompatibilityUpgradeSql()),
    beforeFingerprintSha256: hash(JSON.stringify(expectedCheckInCompatibilityBeforeFingerprint())),
    afterFingerprintSha256: hash(JSON.stringify(expectedCheckInCompatibilityAfterFingerprint())),
  };
}

export function materializeCheckInCompatibilityUpgrade() {
  // Refuse to derive checked-in artifacts from a modified working baseline.
  if (
    readFileSync(resolve(dbPackageRoot, localBaselinePath), "utf8") !== canonicalCheckInBaseline()
  )
    throw new Error("working baseline differs from the pinned check-in checkpoint");
  mkdirSync(directory, { recursive: true });
  writeFileSync(upgradePath, expectedCheckInCompatibilityUpgradeSql());
  writeFileSync(
    beforePath,
    `${JSON.stringify(expectedCheckInCompatibilityBeforeFingerprint(), null, 2)}\n`,
  );
  writeFileSync(
    afterPath,
    `${JSON.stringify(expectedCheckInCompatibilityAfterFingerprint(), null, 2)}\n`,
  );
  console.log("[check-in:compatibility] materialized pinned additive source and full fingerprints");
}

/**
 * Only caller-owned disposable verification may invoke this function.  It has no
 * target URL, backup, restore, or apply CLI so it cannot be mistaken for a
 * preserved-target activation runner.
 */
export async function applyCheckInCompatibilityUpgrade(pool: Pick<Pool, "connect">) {
  const sql = readFileSync(upgradePath, "utf8");
  const before = JSON.parse(readFileSync(beforePath, "utf8"));
  const after = JSON.parse(readFileSync(afterPath, "utf8"));
  assertCheckInCompatibilityArtifact(sql);
  assertCheckInCompatibilityFingerprints(before, after);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '10s'; set local statement_timeout = '60s'");
    const actualBefore = await createSchemaFingerprint(client);
    if (!same(actualBefore, before))
      throw new Error(
        "pre-upgrade fingerprint mismatch; refusing unknown, partial, or replayed schema",
      );
    if (!sql.includes("\nBEGIN;\n") || !sql.endsWith("COMMIT;\n"))
      throw new Error("check-in compatibility transaction envelope missing");
    await client.query(sql.replace("\nBEGIN;\n", "\n").replace(/COMMIT;\n$/, ""));
    const actualAfter = await createSchemaFingerprint(client);
    if (!same(actualAfter, after))
      throw new Error("post-upgrade fingerprint mismatch; rolling back");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith("check-in-compatibility-upgrade.ts")) {
  if (process.argv.slice(2).join(" ") !== "--materialize")
    throw new Error(
      "only --materialize is supported; preserved-target apply is deliberately unavailable",
    );
  materializeCheckInCompatibilityUpgrade();
}
