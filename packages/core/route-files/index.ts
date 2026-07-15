import { z } from "zod";

export const ROUTE_FILE_EXTENSIONS = ["gpx", "tcx", "xml"] as const;
export const SUPPORTED_ROUTE_FILE_EXTENSIONS = ROUTE_FILE_EXTENSIONS;
export const ROUTE_FILE_MIME_TYPES = {
  gpx: "application/gpx+xml",
  tcx: "application/vnd.garmin.tcx+xml",
  xml: "application/xml",
} as const;
export const ROUTE_FILE_WEB_ACCEPT = [
  ".gpx",
  ".tcx",
  ".xml",
  ROUTE_FILE_MIME_TYPES.gpx,
  ROUTE_FILE_MIME_TYPES.tcx,
  ROUTE_FILE_MIME_TYPES.xml,
  "text/xml",
] as const;
export const ROUTE_FILE_WEB_ACCEPT_ATTRIBUTE = ROUTE_FILE_WEB_ACCEPT.join(",");
export const ROUTE_FILE_NATIVE_MIME_TYPES = [
  ROUTE_FILE_MIME_TYPES.gpx,
  ROUTE_FILE_MIME_TYPES.tcx,
  ROUTE_FILE_MIME_TYPES.xml,
  "text/xml",
] as const;
export const MAX_ROUTE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_ROUTE_POINT_COUNT = 100_000;
export const MAX_ROUTE_FILE_POINT_COUNT = MAX_ROUTE_POINT_COUNT;
export const GPX_ROUTE_FILE_MIME_TYPE = ROUTE_FILE_MIME_TYPES.gpx;
export const TCX_ROUTE_FILE_MIME_TYPE = ROUTE_FILE_MIME_TYPES.tcx;
export const XML_ROUTE_FILE_MIME_TYPE = ROUTE_FILE_MIME_TYPES.xml;

export const routeFileExtensionSchema = z.enum(ROUTE_FILE_EXTENSIONS);
export type RouteFileExtension = z.infer<typeof routeFileExtensionSchema>;

export function getRouteFileExtension(fileName: string): RouteFileExtension | null {
  const extension = fileName.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  const result = routeFileExtensionSchema.safeParse(extension);
  return result.success ? result.data : null;
}

export function deriveRouteNameFromFileName(fileName: string): string {
  const trimmedName = fileName.trim();
  const extension = getRouteFileExtension(trimmedName);
  return extension === null ? trimmedName : trimmedName.slice(0, -(extension.length + 1));
}

function hasUnsafeRouteFileNameCharacters(fileName: string): boolean {
  return [...fileName].some((character) => {
    const code = character.charCodeAt(0);
    return character === "/" || character === "\\" || code <= 31 || code === 127;
  });
}

export const safeRouteFileNameSchema = z
  .string()
  .trim()
  .min(1, "File name is required")
  .max(255, "File name must be at most 255 characters")
  .refine(
    (fileName) => !hasUnsafeRouteFileNameCharacters(fileName),
    "File name contains unsafe characters",
  )
  .refine((fileName) => fileName !== "." && fileName !== "..", "File name is unsafe")
  .refine(
    (fileName) => getRouteFileExtension(fileName) !== null,
    "Unsupported route file extension",
  );

/** Runtime-neutral metadata; web File and native document handles pass through unchanged. */
export const portableRouteFileMetadataSchema = z
  .object({
    name: safeRouteFileNameSchema,
    size: z.number().int().positive().max(MAX_ROUTE_FILE_SIZE_BYTES),
    type: z.string().nullable().optional(),
  })
  .passthrough();

export const routeNameSchema = z.string().trim().min(1, "Route name is required").max(100);
export const routeDescriptionSchema = z
  .string()
  .trim()
  .max(1_000, "Description must be at most 1000 characters")
  .nullable()
  .optional()
  .transform((description) => (description ? description : null));

export const routeUploadFormSchema = z
  .object({
    files: z.array(portableRouteFileMetadataSchema).length(1, "Select exactly one route file"),
    name: routeNameSchema,
    description: routeDescriptionSchema,
  })
  .strict();

export type PortableRouteFileMetadataInput = z.input<typeof portableRouteFileMetadataSchema>;
export type PortableRouteFileMetadata = z.output<typeof portableRouteFileMetadataSchema>;
export type RouteUploadFormInput = z.input<typeof routeUploadFormSchema>;
export type RouteUploadForm = z.output<typeof routeUploadFormSchema>;
