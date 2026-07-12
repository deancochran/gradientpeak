import { z } from "zod";
import {
  calculationReasonCodeSchema,
  calculationResultSchema,
} from "./calculation-result-contracts";
import { fingerprintCanonicalJson } from "./canonical-json";
import { sourceIdSchema } from "./lineage";
import {
  type AthleteIntelligenceModelInput,
  athleteIntelligenceModelInputSchema,
  type ModelReadCoverage,
  modelReadCoverageSchema,
} from "./model-input-contracts";

export const ATHLETE_STATE_VECTOR_VERSION = "athlete-state-vector-v1" as const;

export const athleteStateCoverageSchema = z
  .object({
    state: z.enum(["complete", "partial", "unknown"]),
    reasonCodes: z.array(calculationReasonCodeSchema),
    sourceIds: z.array(sourceIdSchema).max(256),
  })
  .strict();

const policyVersionSchema = z
  .object({
    policy: z.string().trim().min(1).max(128),
    version: z.string().trim().min(1).max(128),
  })
  .strict();

const stateChannelFields = {
  result: calculationResultSchema,
  coverage: athleteStateCoverageSchema,
  calculationIdentity: z.string().trim().min(1).max(256),
};

export const athleteStateChannelSchema = z.object(stateChannelFields).strict();
export const sportSpecificExternalWorkChannelSchema = z
  .object({
    sport: z.string().trim().min(1).max(64),
    loadIdentity: z.string().trim().min(1).max(128),
    ...stateChannelFields,
  })
  .strict();

export const athleteStateVectorSchema = z
  .object({
    contractVersion: z.literal(ATHLETE_STATE_VECTOR_VERSION),
    athleteId: z.string().min(1),
    assessmentAsOf: z.string().datetime({ offset: true }),
    internalResponse: athleteStateChannelSchema,
    externalWork: z.array(sportSpecificExternalWorkChannelSchema).max(64),
    mechanicalExposure: athleteStateChannelSchema,
    strengthExposure: athleteStateChannelSchema,
    wellnessContext: athleteStateChannelSchema,
    calendarContext: athleteStateChannelSchema,
    policyVersions: z.array(policyVersionSchema).max(64),
    domainCoverage: modelReadCoverageSchema,
    limitations: z.array(z.string().trim().min(1).max(256)).max(64),
    generatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((state, context) => {
    const sports = state.externalWork.map(({ sport, loadIdentity }) => `${sport}:${loadIdentity}`);
    if (new Set(sports).size !== sports.length)
      context.addIssue({
        code: "custom",
        message: "External-work sport/load identities must be unique",
      });
    const policies = state.policyVersions.map(({ policy }) => policy);
    if (new Set(policies).size !== policies.length)
      context.addIssue({ code: "custom", message: "Policy names must be unique" });
  });

const channelInputSchema = z
  .object({
    result: calculationResultSchema,
    coverageDomain: z.enum(["metrics", "activities", "efforts", "schedules"]),
    policy: policyVersionSchema,
    identityInputs: z.unknown(),
  })
  .strict();
const externalChannelInputSchema = channelInputSchema
  .extend({
    sport: z.string().trim().min(1).max(64),
    loadIdentity: z.string().trim().min(1).max(128),
  })
  .strict();
const assembleAthleteStateInputSchema = z
  .object({
    model: athleteIntelligenceModelInputSchema,
    internalResponse: channelInputSchema,
    externalWork: z.array(externalChannelInputSchema).max(64),
    mechanicalExposure: channelInputSchema,
    strengthExposure: channelInputSchema,
    wellnessContext: channelInputSchema,
    calendarContext: channelInputSchema,
    policyVersions: z.array(policyVersionSchema).max(64),
    limitations: z.array(z.string().trim().min(1).max(256)).max(64),
    generatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type AthleteStateChannel = z.infer<typeof athleteStateChannelSchema>;
export type AthleteStateVector = z.infer<typeof athleteStateVectorSchema>;
export type AssembleAthleteStateInput = Omit<
  z.input<typeof assembleAthleteStateInputSchema>,
  "model"
> & { model: AthleteIntelligenceModelInput };

function materializeChannel(
  channel: z.infer<typeof channelInputSchema>,
  model: Pick<
    AthleteIntelligenceModelInput,
    "assessmentAsOf" | "activityWindow" | "athleteId" | "evidenceRegistry"
  > & {
    readCoverage: ModelReadCoverage;
  },
) {
  const sourceByLineage = new Map<string, string>();
  for (const sourceId of [...new Set(channel.result.contributingSourceIds)].sort()) {
    const evidence = model.evidenceRegistry[sourceId];
    if (!evidence)
      throw new Error(`Calculation result references unknown evidence source: ${sourceId}`);
    if (evidence.athleteId !== model.athleteId)
      throw new Error(`Calculation result evidence source belongs to another athlete: ${sourceId}`);
    if (!sourceByLineage.has(evidence.lineageGroupId))
      sourceByLineage.set(evidence.lineageGroupId, sourceId);
  }
  const sourceIds = [...sourceByLineage.values()].sort();
  const evidenceItems = sourceIds.map((sourceId) => model.evidenceRegistry[sourceId]);
  const reasonCodes = [...new Set(channel.result.reasonCodes)].sort();
  const domain = model.readCoverage[channel.coverageDomain];
  const state =
    domain.state === "truncated"
      ? "partial"
      : channel.result.state === "observed" || channel.result.state === "estimated"
        ? "complete"
        : sourceIds.length > 0
          ? "partial"
          : "unknown";
  const coverageReasonCodes = [
    ...new Set([
      ...(domain.state === "truncated" ? [`${channel.coverageDomain}_read_${domain.reason}`] : []),
      ...(state === "complete" ? [] : reasonCodes),
    ]),
  ].sort();
  const coverage = { state, reasonCodes: coverageReasonCodes, sourceIds } as const;
  const canonicalResult = {
    ...channel.result,
    reasonCodes,
    contributingSourceIds: sourceIds,
  };
  return {
    result: canonicalResult,
    coverage,
    calculationIdentity: fingerprintCanonicalJson({
      assessmentAsOf: model.assessmentAsOf,
      activityWindow: model.activityWindow,
      sourceIds,
      evidenceItems,
      rawAndCalibrationInputs: channel.identityInputs,
      policy: channel.policy,
      coverage,
      result: canonicalResult,
    }),
  };
}

/** Pure request-scoped assembly: no clock, persistence, cache, or input mutation. */
export function assembleAthleteState(input: AssembleAthleteStateInput): AthleteStateVector {
  const parsed = assembleAthleteStateInputSchema.parse(input);
  const channel = (value: z.infer<typeof channelInputSchema>) =>
    materializeChannel(value, parsed.model);
  return athleteStateVectorSchema.parse({
    contractVersion: ATHLETE_STATE_VECTOR_VERSION,
    athleteId: parsed.model.athleteId,
    assessmentAsOf: parsed.model.assessmentAsOf,
    internalResponse: channel(parsed.internalResponse),
    externalWork: parsed.externalWork.map(({ sport, loadIdentity, ...value }) => ({
      sport,
      loadIdentity,
      ...channel(value),
    })),
    mechanicalExposure: channel(parsed.mechanicalExposure),
    strengthExposure: channel(parsed.strengthExposure),
    wellnessContext: channel(parsed.wellnessContext),
    calendarContext: channel(parsed.calendarContext),
    policyVersions: parsed.policyVersions,
    domainCoverage: parsed.model.readCoverage,
    limitations: parsed.limitations,
    generatedAt: parsed.generatedAt,
  });
}
