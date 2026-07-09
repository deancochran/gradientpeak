import { forbiddenError, notFoundError } from "../lib/errors/trpc";

export function permissionDeniedNotFound(message = "Resource not found") {
  return notFoundError(message);
}

export function permissionDeniedForbidden(message = "You do not have permission for this action") {
  return forbiddenError(message);
}
