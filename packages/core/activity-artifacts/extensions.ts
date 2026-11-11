import { z } from "zod";

export const DECODED_ARTIFACT_EXTENSION_LIMITS = {
  maxDepth: 4,
  maxArrayItems: 64,
  maxObjectKeys: 64,
  maxStringLength: 1_024,
  maxEntries: 256,
  maxEncodedBytes: 64 * 1_024,
} as const;

export type DecodedArtifactExtensionValue =
  | null
  | boolean
  | number
  | string
  | DecodedArtifactExtensionValue[]
  | { [key: string]: DecodedArtifactExtensionValue };

const extensionKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.:-]+$/);

function valueSchemaAtDepth(depth: number): z.ZodType<DecodedArtifactExtensionValue> {
  const scalar = z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string().max(DECODED_ARTIFACT_EXTENSION_LIMITS.maxStringLength),
  ]);
  if (depth >= DECODED_ARTIFACT_EXTENSION_LIMITS.maxDepth) return scalar;
  const child = z.lazy(() => valueSchemaAtDepth(depth + 1));
  return z.union([
    scalar,
    z.array(child).max(DECODED_ARTIFACT_EXTENSION_LIMITS.maxArrayItems),
    z
      .record(extensionKeySchema, child)
      .refine(
        (value) => Object.keys(value).length <= DECODED_ARTIFACT_EXTENSION_LIMITS.maxObjectKeys,
        `Extension objects cannot exceed ${DECODED_ARTIFACT_EXTENSION_LIMITS.maxObjectKeys} keys.`,
      ),
  ]);
}

export function getDecodedArtifactExtensionEntryCount(
  value: DecodedArtifactExtensionValue,
): number {
  if (Array.isArray(value)) {
    return (
      value.length +
      value.reduce<number>(
        (total, item) =>
          total +
          (item !== null && typeof item === "object"
            ? getDecodedArtifactExtensionEntryCount(item)
            : 0),
        0,
      )
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).reduce<number>(
      (total, item) =>
        total +
        1 +
        (item !== null && typeof item === "object"
          ? getDecodedArtifactExtensionEntryCount(item)
          : 0),
      0,
    );
  }
  return 0;
}

export function getDecodedArtifactExtensionEncodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function isDecodedArtifactExtensionEntryCountWithinLimit(entryCount: number): boolean {
  return (
    Number.isInteger(entryCount) &&
    entryCount >= 0 &&
    entryCount <= DECODED_ARTIFACT_EXTENSION_LIMITS.maxEntries
  );
}

export function isDecodedArtifactExtensionByteLengthWithinLimit(encodedBytes: number): boolean {
  return (
    Number.isInteger(encodedBytes) &&
    encodedBytes >= 0 &&
    encodedBytes <= DECODED_ARTIFACT_EXTENSION_LIMITS.maxEncodedBytes
  );
}

/** Explicit, recursively bounded storage for source fields without canonical meaning. */
export const decodedArtifactExtensionsSchema = z
  .record(extensionKeySchema, valueSchemaAtDepth(0))
  .refine(
    (value) => Object.keys(value).length <= DECODED_ARTIFACT_EXTENSION_LIMITS.maxObjectKeys,
    `Extensions cannot exceed ${DECODED_ARTIFACT_EXTENSION_LIMITS.maxObjectKeys} top-level keys.`,
  )
  .superRefine((value, ctx) => {
    if (
      !isDecodedArtifactExtensionEntryCountWithinLimit(getDecodedArtifactExtensionEntryCount(value))
    ) {
      ctx.addIssue({
        code: "custom",
        message: `Extensions cannot exceed ${DECODED_ARTIFACT_EXTENSION_LIMITS.maxEntries} entries.`,
      });
    }
    if (
      !isDecodedArtifactExtensionByteLengthWithinLimit(
        getDecodedArtifactExtensionEncodedBytes(value),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: `Extensions cannot exceed ${DECODED_ARTIFACT_EXTENSION_LIMITS.maxEncodedBytes} encoded bytes.`,
      });
    }
  });

export type DecodedArtifactExtensions = z.infer<typeof decodedArtifactExtensionsSchema>;
