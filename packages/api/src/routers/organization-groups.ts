import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  addOrganizationGroupAthlete,
  archiveOrganizationGroup,
  assignOrganizationGroupCoach,
  createOrganizationGroup,
  getOrganizationGroup,
  listOrganizationGroupAthletes,
  listOrganizationGroupCoaches,
  listOrganizationGroups,
  OrganizationGroupManagementError,
  removeOrganizationGroupAthlete,
  removeOrganizationGroupCoach,
} from "../application/organizations/manage-organization-groups";
import { getRequiredDb } from "../db";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const ids = z.object({ organizationId: z.string().uuid(), groupId: z.string().uuid() }).strict();
const page = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().uuid().nullable().default(null),
  })
  .strict();
const group = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.date(),
  })
  .strict();
const result = z
  .object({ id: z.string().uuid(), status: z.enum(["created", "archived", "active", "ended"]) })
  .strict();
const pageOutput = <T extends z.ZodType>(item: T) =>
  z
    .object({
      items: z.array(item),
      nextCursor: z.string().uuid().nullable(),
      hasMore: z.boolean(),
    })
    .strict();
function fail(error: unknown): never {
  if (error instanceof OrganizationGroupManagementError)
    throw new TRPCError({
      code:
        error.reason === "not_found"
          ? "NOT_FOUND"
          : error.reason === "conflict"
            ? "CONFLICT"
            : error.reason === "invalid_cursor"
              ? "BAD_REQUEST"
              : "FORBIDDEN",
      message: "Organization group request could not be completed",
      cause: error,
    });
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Organization group request failed",
    cause: error,
  });
}
const run = <T>(promise: Promise<T>) => promise.catch(fail);
export const organizationGroupsRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ organizationId: z.string().uuid() }).merge(page))
    .output(pageOutput(group))
    .query(({ ctx, input }) =>
      run(
        listOrganizationGroups({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          ...input,
        }),
      ),
    ),
  get: protectedProcedure
    .input(ids)
    .output(group)
    .query(({ ctx, input }) =>
      run(
        getOrganizationGroup({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          ...input,
        }),
      ),
    ),
  create: protectedProcedure
    .input(
      ids.extend({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(2000).nullable(),
      }),
    )
    .output(result)
    .mutation(({ ctx, input }) =>
      run(
        createOrganizationGroup({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          groupId: input.groupId,
          organizationId: input.organizationId,
          name: input.name,
          description: input.description,
        }),
      ),
    ),
  archive: protectedProcedure
    .input(ids)
    .output(result)
    .mutation(({ ctx, input }) =>
      run(
        archiveOrganizationGroup({
          db: getRequiredDb(ctx),
          actorProfileId: ctx.session.user.id,
          ...input,
        }),
      ),
    ),
  athletes: createTRPCRouter({
    list: protectedProcedure
      .input(ids.merge(page))
      .output(
        pageOutput(z.object({ id: z.string().uuid(), engagementId: z.string().uuid() }).strict()),
      )
      .query(({ ctx, input }) =>
        run(
          listOrganizationGroupAthletes({
            db: getRequiredDb(ctx),
            actorProfileId: ctx.session.user.id,
            ...input,
          }),
        ),
      ),
    add: protectedProcedure
      .input(ids.extend({ linkId: z.string().uuid(), engagementId: z.string().uuid() }))
      .output(result)
      .mutation(({ ctx, input }) =>
        run(
          addOrganizationGroupAthlete({
            db: getRequiredDb(ctx),
            actorProfileId: ctx.session.user.id,
            ...input,
          }),
        ),
      ),
    remove: protectedProcedure
      .input(ids.extend({ linkId: z.string().uuid() }))
      .output(result)
      .mutation(({ ctx, input }) =>
        run(
          removeOrganizationGroupAthlete({
            db: getRequiredDb(ctx),
            actorProfileId: ctx.session.user.id,
            ...input,
          }),
        ),
      ),
  }),
  coaches: createTRPCRouter({
    list: protectedProcedure
      .input(ids.merge(page))
      .output(
        pageOutput(z.object({ id: z.string().uuid(), membershipId: z.string().uuid() }).strict()),
      )
      .query(({ ctx, input }) =>
        run(
          listOrganizationGroupCoaches({
            db: getRequiredDb(ctx),
            actorProfileId: ctx.session.user.id,
            ...input,
          }),
        ),
      ),
    assign: protectedProcedure
      .input(ids.extend({ linkId: z.string().uuid(), membershipId: z.string().uuid() }))
      .output(result)
      .mutation(({ ctx, input }) =>
        run(
          assignOrganizationGroupCoach({
            db: getRequiredDb(ctx),
            actorProfileId: ctx.session.user.id,
            ...input,
          }),
        ),
      ),
    remove: protectedProcedure
      .input(ids.extend({ linkId: z.string().uuid() }))
      .output(result)
      .mutation(({ ctx, input }) =>
        run(
          removeOrganizationGroupCoach({
            db: getRequiredDb(ctx),
            actorProfileId: ctx.session.user.id,
            ...input,
          }),
        ),
      ),
  }),
});
