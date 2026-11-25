import { z } from "zod";

export const sourceNamespaceSchema = z.enum(["activity", "metric", "effort", "goal", "manual"]);

export const lineageNamespaceSchema = z.enum(["activity", "metric", "manual-test"]);

function hasNamespacedOpaqueId(
  value: string,
  namespaceSchema: typeof sourceNamespaceSchema | typeof lineageNamespaceSchema,
): boolean {
  const separatorIndex = value.indexOf(":");

  return (
    separatorIndex > 0 &&
    separatorIndex < value.length - 1 &&
    namespaceSchema.safeParse(value.slice(0, separatorIndex)).success
  );
}

export const sourceIdSchema = z
  .string()
  .refine(
    (value) => hasNamespacedOpaqueId(value, sourceNamespaceSchema),
    "Source ID must use an approved namespace and a non-empty opaque ID",
  );

export const lineageGroupIdSchema = z
  .string()
  .refine(
    (value) => hasNamespacedOpaqueId(value, lineageNamespaceSchema),
    "Lineage group ID must use an approved namespace and a non-empty opaque ID",
  );

export type SourceNamespace = z.infer<typeof sourceNamespaceSchema>;
export type LineageNamespace = z.infer<typeof lineageNamespaceSchema>;
export type SourceId = z.infer<typeof sourceIdSchema>;
export type LineageGroupId = z.infer<typeof lineageGroupIdSchema>;

export function parseSourceId(value: SourceId): {
  namespace: SourceNamespace;
  opaqueId: string;
} {
  const separatorIndex = value.indexOf(":");

  return {
    namespace: sourceNamespaceSchema.parse(value.slice(0, separatorIndex)),
    opaqueId: value.slice(separatorIndex + 1),
  };
}

export function parseLineageGroupId(value: LineageGroupId): {
  namespace: LineageNamespace;
  opaqueId: string;
} {
  const separatorIndex = value.indexOf(":");

  return {
    namespace: lineageNamespaceSchema.parse(value.slice(0, separatorIndex)),
    opaqueId: value.slice(separatorIndex + 1),
  };
}

/**
 * Selects the greatest finite influence from each lineage. Equal influences
 * retain the earliest input item, making ties deterministic without mutation.
 */
export function selectOnePerLineage<T>(input: {
  values: readonly T[];
  lineageOf: (value: T) => LineageGroupId;
  influenceOf: (value: T) => number;
}): T[] {
  const selected = new Map<LineageGroupId, { value: T; influence: number }>();

  for (const value of input.values) {
    const lineage = lineageGroupIdSchema.parse(input.lineageOf(value));
    const influence = z.number().finite().parse(input.influenceOf(value));
    const current = selected.get(lineage);

    if (current === undefined || influence > current.influence) {
      selected.set(lineage, { value, influence });
    }
  }

  return Array.from(selected.values(), ({ value }) => value);
}
