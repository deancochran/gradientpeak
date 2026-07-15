import { z } from "zod";
import { canonicalSportSchema } from "../schemas/sport";

export const SUPPORTED_ACTIVITY_FILE_EXTENSIONS = ["fit", "gpx", "tcx"] as const;
export const MAX_ACTIVITY_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export const supportedActivityFileExtensionSchema = z.enum(SUPPORTED_ACTIVITY_FILE_EXTENSIONS);

export type SupportedActivityFileExtension = z.infer<typeof supportedActivityFileExtensionSchema>;

/** Returns a supported terminal extension without guessing from content or earlier suffixes. */
export function getSupportedActivityFileExtension(
  fileName: string,
): SupportedActivityFileExtension | null {
  const extension = fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  const result = supportedActivityFileExtensionSchema.safeParse(extension);
  return result.success ? result.data : null;
}

/** Removes one terminal supported extension and otherwise leaves the filename unchanged. */
export function deriveActivityNameFromFileName(fileName: string): string {
  const extension = getSupportedActivityFileExtension(fileName);
  return extension === null ? fileName : fileName.slice(0, -(extension.length + 1));
}

const safeFileNameSchema = z
  .string()
  .trim()
  .min(1, "File name is required")
  .max(255, "File name must be at most 255 characters")
  .refine((fileName) => !/[\\/\0]/.test(fileName), "File name must not contain path separators");

/** Runtime-neutral metadata; platform-specific handles are intentionally passed through. */
export const portableActivityFileMetadataSchema = z
  .object({
    name: safeFileNameSchema,
    size: z.number().int().positive().max(MAX_ACTIVITY_FILE_SIZE_BYTES),
    type: z.string().nullable().optional(),
  })
  .passthrough();

const normalizedNotesSchema = z
  .string()
  .trim()
  .max(5_000, "Notes must be at most 5000 characters")
  .nullable()
  .transform((notes) => (notes === "" ? null : notes));

export const manualActivityImportFormSchema = z
  .object({
    files: z.array(portableActivityFileMetadataSchema).length(1, "Select exactly one file"),
    sport: canonicalSportSchema,
    name: z.string().trim().min(1, "Activity name is required").max(100),
    notes: normalizedNotesSchema,
  })
  .strict();

export const manualActivityImportProvenanceSchema = z
  .object({
    import_source: z.literal("manual_historical"),
    import_file_type: supportedActivityFileExtensionSchema,
    import_original_file_name: safeFileNameSchema,
  })
  .strict();

export function buildManualActivityImportProvenance(
  fileName: string,
): ManualActivityImportProvenance {
  const safeFileName = safeFileNameSchema.parse(fileName);
  const extension = getSupportedActivityFileExtension(safeFileName);

  if (extension === null) {
    throw new Error("Unsupported activity file extension");
  }

  return manualActivityImportProvenanceSchema.parse({
    import_source: "manual_historical",
    import_file_type: extension,
    import_original_file_name: safeFileName,
  });
}

export type PortableActivityFileMetadataInput = z.input<typeof portableActivityFileMetadataSchema>;
export type PortableActivityFileMetadata = z.output<typeof portableActivityFileMetadataSchema>;
export type PortableActivityFileMetadataOutput = PortableActivityFileMetadata;
export type ManualActivityImportInput = z.input<typeof manualActivityImportFormSchema>;
export type ManualActivityImportOutput = z.output<typeof manualActivityImportFormSchema>;
export type ManualActivityImportProvenance = z.output<typeof manualActivityImportProvenanceSchema>;
