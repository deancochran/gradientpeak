import { TRPCError } from "@trpc/server";

type TRPCErrorCode = ConstructorParameters<typeof TRPCError>[0]["code"];

type BuildTRPCErrorOptions = {
  code: TRPCErrorCode;
  message?: string;
  cause?: unknown;
};

export function buildTRPCError({ code, message, cause }: BuildTRPCErrorOptions) {
  return new TRPCError({ code, message, cause });
}

export function internalServerError(message = "Internal server error", cause?: unknown) {
  return buildTRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause });
}

export function notFoundError(message = "Resource not found", cause?: unknown) {
  return buildTRPCError({ code: "NOT_FOUND", message, cause });
}

export function forbiddenError(
  message = "You do not have permission for this action",
  cause?: unknown,
) {
  return buildTRPCError({ code: "FORBIDDEN", message, cause });
}
