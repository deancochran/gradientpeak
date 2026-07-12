export * from "./athlete-state";
export * from "./calculation-result-contracts";
export * from "./canonical-json";
export * from "./evidence-contracts";
export * from "./goal-demand-policy-contracts";
/**
 * @deprecated Legacy capability and generic gap contracts are isolated from the
 * canonical evidence-to-projection path. Import from `./legacy` only while
 * migrating existing consumers; new calculation work belongs in this barrel.
 */
export * as legacy from "./legacy";
export * from "./lineage";
export * from "./metric-catalog";
export * from "./model-input-contracts";
export * from "./physical-dimensions";
export * from "./planning-context";
export * from "./policies/activity-readiness";
export * from "./policies/effort-curves";
export * from "./policies/goal-demand";
export * from "./policies/physiology-metrics";
export * from "./policies/projection";
export * from "./policies/training-feasibility";
export * from "./policy-descriptors";
export * from "./projection-contracts";
export * from "./uncertainty";
