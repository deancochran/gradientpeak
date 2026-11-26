import {
  MAX_ROUTE_FILE_SIZE_BYTES,
  portableRouteFileMetadataSchema,
  routeUploadFormSchema,
} from "@repo/core/route-files";
import { z } from "zod";

const nativeRouteFileSizeSchema = z
  .number()
  .int("Route file size must be a whole number")
  .positive("Route file size must be greater than zero")
  .max(MAX_ROUTE_FILE_SIZE_BYTES, "Choose a route file no larger than 10 MB.")
  .nullish();

export const nativeRouteFileMetadataSchema = portableRouteFileMetadataSchema
  .omit({ size: true })
  .extend({ size: nativeRouteFileSizeSchema });

export const nativeRouteUploadFormSchema = routeUploadFormSchema.extend({
  files: z.array(nativeRouteFileMetadataSchema).length(1, "Select exactly one route file"),
});

export type NativeRouteUploadForm = z.output<typeof nativeRouteUploadFormSchema>;

export type RouteFileReadErrorCode = "empty" | "oversized" | "unreadable";

const ROUTE_FILE_READ_ERROR_MESSAGES: Record<RouteFileReadErrorCode, string> = {
  empty: "The selected route file is empty. Choose another file.",
  oversized: "The selected route file is larger than 10 MB. Choose a smaller file.",
  unreadable: "The selected route file could not be read. Choose it again and retry.",
};

export class RouteFileReadError extends Error {
  readonly code: RouteFileReadErrorCode;

  constructor(code: RouteFileReadErrorCode) {
    super(ROUTE_FILE_READ_ERROR_MESSAGES[code]);
    this.name = "RouteFileReadError";
    this.code = code;
  }
}

export function getRouteFileReadErrorMessage(error: unknown): string {
  return error instanceof RouteFileReadError
    ? error.message
    : ROUTE_FILE_READ_ERROR_MESSAGES.unreadable;
}

export async function readRouteFileText(
  uri: string,
  fetchFile: typeof fetch = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchFile(uri);
  } catch {
    throw new RouteFileReadError("unreadable");
  }

  if (!response.ok) {
    throw new RouteFileReadError("unreadable");
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new RouteFileReadError("unreadable");
  }

  if (text.length === 0) {
    throw new RouteFileReadError("empty");
  }
  if (new TextEncoder().encode(text).byteLength > MAX_ROUTE_FILE_SIZE_BYTES) {
    throw new RouteFileReadError("oversized");
  }

  return text;
}
