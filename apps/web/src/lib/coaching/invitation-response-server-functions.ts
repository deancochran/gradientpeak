import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

const tokenSchema = z.object({ token: z.string().min(43).max(256) }).strict();
const pageSchema = z
  .object({ limit: z.number().int().min(1).max(50), cursor: z.string().nullable() })
  .strict();

async function caller() {
  const [{ appRouter, createApiContext }, { resolveAuthSessionFromHeaders }, { db }] =
    await Promise.all([
      import("@repo/api/server"),
      import("@repo/auth/server"),
      import("@repo/db/client"),
    ]);
  const headers = getRequestHeaders();
  const session = await resolveAuthSessionFromHeaders(headers);
  return appRouter.createCaller(await createApiContext({ headers, auth: { session }, db }));
}

function unavailable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND", "PRECONDITION_FAILED"] as const).includes(
      (error as { code?: "FORBIDDEN" | "UNAUTHORIZED" | "NOT_FOUND" | "PRECONDITION_FAILED" })
        .code ?? "FORBIDDEN",
    )
  );
}

export const loadMyOrganizationInvitations = createServerFn({ method: "POST" })
  .validator((input: unknown) => pageSchema.parse(input))
  .handler(async ({ data }) => (await caller()).organizations.invitations.listMine(data));

export const previewOrganizationInvitation = createServerFn({ method: "POST" })
  .validator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return {
        status: "ready" as const,
        preview: await (await caller()).organizations.invitations.preview(data),
      };
    } catch (error) {
      if (unavailable(error)) return { status: "unavailable" as const };
      throw error;
    }
  });

export const acceptOrganizationInvitation = createServerFn({ method: "POST" })
  .validator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return {
        status: "accepted" as const,
        receipt: await (await caller()).organizations.invitations.accept(data),
      };
    } catch (error) {
      if (unavailable(error)) return { status: "unavailable" as const };
      throw error;
    }
  });

export const declineOrganizationInvitation = createServerFn({ method: "POST" })
  .validator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return {
        status: "declined" as const,
        receipt: await (await caller()).organizations.invitations.decline(data),
      };
    } catch (error) {
      if (unavailable(error)) return { status: "unavailable" as const };
      throw error;
    }
  });
