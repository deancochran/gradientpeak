import type { AutocommitSession, MigrationExecutionMode } from "./_disposable-target";
import type { MigrationOperation } from "./_migration-operations";

export type MigrationLedgerEntry = {
  version: string;
  name: string;
  sha256: string;
  executionMode: MigrationExecutionMode;
  operation?: MigrationOperation;
};

export type MigrationPolicy = {
  authorityDirectory: string;
  activeLedgerFile: string;
  forwardMigrations: {
    autocommitSession: AutocommitSession;
  };
};

export function autocommitSettings(policy: MigrationPolicy, entry: MigrationLedgerEntry) {
  if (entry.executionMode !== "autocommit") return undefined;
  if (!entry.operation)
    throw new Error(`autocommit migration ${entry.version} is missing operation metadata`);
  return { ...policy.forwardMigrations.autocommitSession, operation: entry.operation };
}
