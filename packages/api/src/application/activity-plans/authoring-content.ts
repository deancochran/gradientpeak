import { activityPlanAuthoringContentSchema } from "@repo/core/activity-plan";
import { z } from "zod";

const apiAuthoringContentSchema = z.unknown().transform((input, context) => {
  const result = activityPlanAuthoringContentSchema.safeParse(input);
  if (result.success) return result.data;
  // Let Zod produce the native Error that tRPC preserves as a cause. Constructing
  // ZodError directly can lose non-enumerable issue diagnostics in tRPC transport.
  for (const issue of result.error.issues) {
    context.addIssue({
      ...issue,
      path: issue.path[0] === "intent" ? issue.path.slice(1) : issue.path,
    });
  }
  return z.NEVER;
});

/** New writes and newly selected prescriptions only; historical reads use persisted schemas. */
export function parseActivityPlanAuthoringContent(input: {
  structure: unknown;
  adaptation?: unknown;
  training_intent: unknown;
}) {
  const content = apiAuthoringContentSchema.parse({
    structure: input.structure,
    adaptation: input.adaptation ?? null,
    intent: { training_intent: input.training_intent },
  });
  return { ...content, adaptation: content.adaptation ?? null };
}
