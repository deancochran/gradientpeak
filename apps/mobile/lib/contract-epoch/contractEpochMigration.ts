import { CURRENT_CONTRACT_EPOCH } from "@repo/api/contract-epoch";

export const CONTRACT_EPOCH_STORAGE_KEY = "gradientpeak:contract-epoch";
export const CONTRACT_EPOCH_MIGRATION_STORAGE_KEY = `gradientpeak:contract-epoch:migration:${CURRENT_CONTRACT_EPOCH}`;

export type ContractEpochMigrationSummary = {
  quarantinedRecordingIntents: number;
  quarantinedQueueJobs: number;
};

type ContractEpochMigrationJournal = {
  version: 1;
  sourceEpoch: string | null;
  targetEpoch: number;
  phase: "prepared" | "recording-evidence-migrated" | "complete";
  startedAt: string;
  summary?: ContractEpochMigrationSummary;
  completedAt?: string;
};

export type ContractEpochMigrationDependencies = {
  getMarker: () => Promise<string | null>;
  setMarker: (value: string) => Promise<void>;
  getMigrationJournal: () => Promise<string | null>;
  setMigrationJournal: (value: string) => Promise<void>;
  migrateRecordingEvidence: (input: {
    sourceEpoch: string | null;
    targetEpoch: number;
  }) => Promise<ContractEpochMigrationSummary>;
  now?: () => string;
};

function parseMigrationJournal(value: string): ContractEpochMigrationJournal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Contract epoch migration journal is invalid");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Contract epoch migration journal is invalid");
  }
  const journal = parsed as Partial<ContractEpochMigrationJournal>;
  if (
    journal.version !== 1 ||
    journal.targetEpoch !== CURRENT_CONTRACT_EPOCH ||
    !["prepared", "recording-evidence-migrated", "complete"].includes(journal.phase ?? "") ||
    typeof journal.startedAt !== "string" ||
    !(journal.sourceEpoch === null || typeof journal.sourceEpoch === "string")
  ) {
    throw new Error("Contract epoch migration journal is invalid");
  }
  if (journal.phase !== "prepared") {
    if (
      !journal.summary ||
      !Number.isInteger(journal.summary.quarantinedRecordingIntents) ||
      !Number.isInteger(journal.summary.quarantinedQueueJobs)
    ) {
      throw new Error("Contract epoch migration journal is invalid");
    }
  }
  if (journal.phase === "complete" && typeof journal.completedAt !== "string") {
    throw new Error("Contract epoch migration journal is invalid");
  }
  return journal as ContractEpochMigrationJournal;
}

function serializeMigrationJournal(journal: ContractEpochMigrationJournal): string {
  return JSON.stringify(journal);
}

export function createContractEpochInitializer(dependencies: ContractEpochMigrationDependencies) {
  return async function initializeContractEpoch(): Promise<"current" | "migrated"> {
    const marker = await dependencies.getMarker();
    if (marker === String(CURRENT_CONTRACT_EPOCH)) return "current";
    if (marker !== null && !/^\d{1,9}$/.test(marker)) {
      throw new Error("Stored contract epoch marker is invalid");
    }
    const numericMarker = marker === null ? null : Number(marker);
    if (
      numericMarker !== null &&
      Number.isInteger(numericMarker) &&
      numericMarker > CURRENT_CONTRACT_EPOCH
    ) {
      throw new Error("Stored contract epoch is newer than this client");
    }

    const now = dependencies.now ?? (() => new Date().toISOString());
    const storedJournal = await dependencies.getMigrationJournal();
    let journal: ContractEpochMigrationJournal;
    if (storedJournal === null) {
      journal = {
        version: 1,
        sourceEpoch: marker,
        targetEpoch: CURRENT_CONTRACT_EPOCH,
        phase: "prepared",
        startedAt: now(),
      };
      await dependencies.setMigrationJournal(serializeMigrationJournal(journal));
    } else {
      journal = parseMigrationJournal(storedJournal);
      if (journal.sourceEpoch !== marker) {
        throw new Error("Contract epoch migration source marker changed");
      }
    }

    if (journal.phase === "prepared") {
      const summary = await dependencies.migrateRecordingEvidence({
        sourceEpoch: journal.sourceEpoch,
        targetEpoch: journal.targetEpoch,
      });
      journal = { ...journal, phase: "recording-evidence-migrated", summary };
      await dependencies.setMigrationJournal(serializeMigrationJournal(journal));
    }
    if (journal.phase === "recording-evidence-migrated") {
      journal = { ...journal, phase: "complete", completedAt: now() };
      await dependencies.setMigrationJournal(serializeMigrationJournal(journal));
    }

    // The current marker is the commit record observed by the rest of the app.
    // It is deliberately written only after the durable migration journal is complete.
    await dependencies.setMarker(String(CURRENT_CONTRACT_EPOCH));
    return "migrated";
  };
}
