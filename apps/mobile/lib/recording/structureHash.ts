import {
  getCanonicalActivityPlanStructureHashInput,
  type RecordingPlanExecutionSnapshot,
} from "@repo/core";

export async function hashRecordingPlan(planSnapshot: unknown): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } = await import("expo-crypto");
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    getCanonicalActivityPlanStructureHashInput(planSnapshot),
  );
}

export async function assertRecordingPlanExecutionStructureHashes(
  execution: RecordingPlanExecutionSnapshot | null | undefined,
): Promise<void> {
  if (!execution) return;
  const executionHash = `v1:sha256:${await hashRecordingPlan(execution.structure)}`;
  if (executionHash !== execution.structureHash) {
    throw new Error("Invalid recording prescription structure hash");
  }
  const prescription = execution.plannedSession?.prescription;
  if (!prescription) return;
  const prescriptionHash = `v1:sha256:${await hashRecordingPlan(prescription.structure)}`;
  if (prescriptionHash !== prescription.structureHash) {
    throw new Error("Invalid planned-session prescription structure hash");
  }
}
