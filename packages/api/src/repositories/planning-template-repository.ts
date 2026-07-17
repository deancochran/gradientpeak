import type { DrizzleDbClient } from "@repo/db/client";

export type LockedPlanningTemplateRow = {
  activityCategory: string;
  gpsRecordingEnabled: boolean;
  id: string;
  isSystemTemplate: boolean;
  structure: unknown;
  version: string;
};

export type TrainingPlanTransactionClient = Pick<
  DrizzleDbClient,
  "delete" | "execute" | "insert" | "select" | "update"
>;

export interface PlanningTemplateRepository {
  listAvailablePublicSystemTemplateIds(): Promise<string[]>;
  assertAvailablePublicSystemTemplateIds(templateIds: string[]): Promise<{
    availableIds: string[];
    missingIds: string[];
  }>;
  withLockedPublishedTemplates<T>(
    templateIds: string[],
    operation: (input: {
      db: TrainingPlanTransactionClient;
      rows: LockedPlanningTemplateRow[];
    }) => Promise<T>,
  ): Promise<T>;
}
