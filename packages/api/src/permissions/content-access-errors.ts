import { TRPCError } from "@trpc/server";

export function permissionDeniedNotFound(message = "Resource not found") {
  return new TRPCError({ code: "NOT_FOUND", message });
}

export function permissionDeniedForbidden(message = "You do not have permission for this action") {
  return new TRPCError({ code: "FORBIDDEN", message });
}
