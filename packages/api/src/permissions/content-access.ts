import { type DrizzleDbClient, schema } from "@repo/db";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { permissionDeniedForbidden, permissionDeniedNotFound } from "./content-access-errors";
import type {
  AccessLevel,
  AccessSource,
  GrantInput,
  PermissionAction,
  PermissionDecision,
  PermissionResource,
} from "./content-access-types";

type ResourceRow = {
  id: string;
  ownerProfileId: string | null;
  isPublic: boolean;
  isSystem: boolean;
  routeId?: string | null;
};

export type ContentAccessRow = {
  ownerProfileId?: string | null;
  isPublic?: boolean | null;
  isSystem?: boolean | null;
};

type ReadableRowInput<T> = {
  row: T;
  resource: PermissionResource;
  access: ContentAccessRow;
};

export function canContentRowSatisfyRead(row: ContentAccessRow, actorProfileId: string) {
  return row.ownerProfileId === actorProfileId || row.isPublic === true || row.isSystem === true;
}

function contentRowReadReason(row: ContentAccessRow, actorProfileId: string) {
  if (row.ownerProfileId === actorProfileId) {
    return "owner" as const;
  }

  if (row.isSystem === true) {
    return "system" as const;
  }

  if (row.isPublic === true) {
    return "public" as const;
  }

  return "denied" as const;
}

export function needsContentGrantForRow(row: ContentAccessRow, granteeProfileId: string) {
  if (
    row.ownerProfileId === undefined &&
    row.isPublic === undefined &&
    row.isSystem === undefined
  ) {
    return false;
  }

  return !canContentRowSatisfyRead(row, granteeProfileId);
}

function activeGrantCondition(now = new Date()) {
  return and(
    isNull(schema.contentAccessGrants.revoked_at),
    or(
      isNull(schema.contentAccessGrants.expires_at),
      gt(schema.contentAccessGrants.expires_at, now),
    ),
  );
}

function readGrantLevels(action: PermissionAction): AccessLevel[] {
  if (action === "read") {
    return ["read", "read_geometry"];
  }

  if (action === "read_geometry") {
    return ["read_geometry"];
  }

  return [];
}

function canRowSatisfyAction(row: ResourceRow, actorProfileId: string, action: PermissionAction) {
  if (row.ownerProfileId === actorProfileId) {
    return { allowed: true, reason: "owner" as const };
  }

  if (action === "manage") {
    return { allowed: false, reason: "denied" as const };
  }

  if (row.isSystem) {
    return { allowed: true, reason: "system" as const };
  }

  if (row.isPublic) {
    return { allowed: true, reason: "public" as const };
  }

  return { allowed: false, reason: "denied" as const };
}

export function createContentAccessPermissions(db: DrizzleDbClient) {
  async function findResource(resource: PermissionResource): Promise<ResourceRow | null> {
    if (resource.type === "activity_plan") {
      const [row] = await db
        .select({
          id: schema.activityPlans.id,
          ownerProfileId: schema.activityPlans.profile_id,
          templateVisibility: schema.activityPlans.template_visibility,
          isSystem: schema.activityPlans.is_system_template,
          routeId: schema.activityPlans.route_id,
        })
        .from(schema.activityPlans)
        .where(eq(schema.activityPlans.id, resource.id))
        .limit(1);

      return row
        ? {
            id: row.id,
            ownerProfileId: row.ownerProfileId,
            isPublic: row.templateVisibility === "public",
            isSystem: row.isSystem,
            routeId: row.routeId,
          }
        : null;
    }

    if (resource.type === "activity_route") {
      const [row] = await db
        .select({
          id: schema.activityRoutes.id,
          ownerProfileId: schema.activityRoutes.profile_id,
          isPublic: schema.activityRoutes.is_public,
          isSystem: schema.activityRoutes.is_system_template,
        })
        .from(schema.activityRoutes)
        .where(eq(schema.activityRoutes.id, resource.id))
        .limit(1);

      return row
        ? {
            id: row.id,
            ownerProfileId: row.ownerProfileId,
            isPublic: row.isPublic,
            isSystem: row.isSystem,
          }
        : null;
    }

    if (resource.type === "training_plan") {
      const [row] = await db
        .select({
          id: schema.trainingPlans.id,
          ownerProfileId: schema.trainingPlans.profile_id,
          templateVisibility: schema.trainingPlans.template_visibility,
          isSystem: schema.trainingPlans.is_system_template,
        })
        .from(schema.trainingPlans)
        .where(eq(schema.trainingPlans.id, resource.id))
        .limit(1);

      return row
        ? {
            id: row.id,
            ownerProfileId: row.ownerProfileId,
            isPublic: row.templateVisibility === "public",
            isSystem: row.isSystem,
          }
        : null;
    }

    if (resource.type === "event") {
      const [row] = await db
        .select({ id: schema.events.id, ownerProfileId: schema.events.profile_id })
        .from(schema.events)
        .where(eq(schema.events.id, resource.id))
        .limit(1);

      return row
        ? { id: row.id, ownerProfileId: row.ownerProfileId, isPublic: false, isSystem: false }
        : null;
    }

    const [row] = await db
      .select({
        id: schema.profiles.id,
        ownerProfileId: schema.profiles.id,
        isPublic: schema.profiles.is_public,
      })
      .from(schema.profiles)
      .where(eq(schema.profiles.id, resource.id))
      .limit(1);

    return row
      ? { id: row.id, ownerProfileId: row.ownerProfileId, isPublic: row.isPublic, isSystem: false }
      : null;
  }

  async function findActiveGrant(input: {
    actorProfileId: string;
    action: PermissionAction;
    resource: PermissionResource;
  }) {
    const levels = readGrantLevels(input.action);
    if (levels.length === 0) {
      return null;
    }

    const [grant] = await db
      .select({
        accessLevel: schema.contentAccessGrants.access_level,
        sourceType: schema.contentAccessGrants.source_type,
        sourceId: schema.contentAccessGrants.source_id,
      })
      .from(schema.contentAccessGrants)
      .where(
        and(
          eq(schema.contentAccessGrants.grantee_profile_id, input.actorProfileId),
          eq(schema.contentAccessGrants.content_type, input.resource.type),
          eq(schema.contentAccessGrants.content_id, input.resource.id),
          inArray(schema.contentAccessGrants.access_level, levels),
          activeGrantCondition(),
        ),
      )
      .limit(1);

    return grant ?? null;
  }

  async function can(input: {
    actorProfileId: string;
    action: PermissionAction;
    resource: PermissionResource;
  }): Promise<PermissionDecision> {
    const row = await findResource(input.resource);
    if (!row) {
      return { allowed: false, reason: "denied" };
    }

    const rowDecision = canRowSatisfyAction(row, input.actorProfileId, input.action);
    if (rowDecision.allowed) {
      return { allowed: true, accessLevel: input.action, reason: rowDecision.reason };
    }

    const grant = await findActiveGrant(input);
    if (grant) {
      return {
        allowed: true,
        accessLevel: input.action,
        reason: "grant",
        source: { type: grant.sourceType, id: grant.sourceId },
      };
    }

    return { allowed: false, reason: "denied" };
  }

  async function require(input: {
    actorProfileId: string;
    action: PermissionAction;
    resource: PermissionResource;
    message?: string;
  }) {
    const decision = await can(input);
    if (!decision.allowed) {
      if (input.action === "manage") {
        throw permissionDeniedForbidden(
          input.message ?? "You do not have permission to manage this resource",
        );
      }

      throw permissionDeniedNotFound(input.message ?? "Resource not found");
    }

    return decision;
  }

  async function requireReadForRow(input: {
    actorProfileId: string;
    resource: PermissionResource;
    row: ContentAccessRow;
    message?: string;
  }) {
    const reason = contentRowReadReason(input.row, input.actorProfileId);
    if (reason !== "denied") {
      return { allowed: true as const, accessLevel: "read" as const, reason };
    }

    return require({
      actorProfileId: input.actorProfileId,
      action: "read",
      resource: input.resource,
      message: input.message,
    });
  }

  async function canReadForRow(input: {
    actorProfileId: string;
    resource: PermissionResource;
    row: ContentAccessRow;
  }) {
    const reason = contentRowReadReason(input.row, input.actorProfileId);
    if (reason !== "denied") {
      return { allowed: true as const, accessLevel: "read" as const, reason };
    }

    return can({ actorProfileId: input.actorProfileId, action: "read", resource: input.resource });
  }

  async function filterReadableRows<T>(input: {
    actorProfileId: string;
    rows: T[];
    getRowInput: (row: T) => ReadableRowInput<T>;
  }) {
    const readableRows: T[] = [];

    for (const row of input.rows) {
      const rowInput = input.getRowInput(row);
      const decision = await canReadForRow({
        actorProfileId: input.actorProfileId,
        resource: rowInput.resource,
        row: rowInput.access,
      });

      if (decision.allowed) {
        readableRows.push(row);
      }
    }

    return readableRows;
  }

  async function grant(input: GrantInput & { accessLevel: AccessLevel }) {
    await db
      .insert(schema.contentAccessGrants)
      .values({
        content_type: input.resource.type,
        content_id: input.resource.id,
        grantee_profile_id: input.granteeProfileId,
        actor_profile_id: input.actorProfileId,
        access_level: input.accessLevel,
        source_type: input.source.type,
        source_id: input.source.id,
        revoked_at: null,
        expires_at: null,
      })
      .onConflictDoUpdate({
        target: [
          schema.contentAccessGrants.content_type,
          schema.contentAccessGrants.content_id,
          schema.contentAccessGrants.grantee_profile_id,
          schema.contentAccessGrants.access_level,
          schema.contentAccessGrants.source_type,
          schema.contentAccessGrants.source_id,
        ],
        set: {
          actor_profile_id: input.actorProfileId,
          revoked_at: null,
          expires_at: null,
        },
      });
  }

  async function grantRead(input: GrantInput) {
    await grant({ ...input, accessLevel: "read" });
  }

  async function grantRouteGeometry(input: Omit<GrantInput, "resource"> & { routeId: string }) {
    await grant({
      ...input,
      accessLevel: "read_geometry",
      resource: { type: "activity_route", id: input.routeId },
    });
  }

  async function revokeSource(source: AccessSource) {
    await db
      .update(schema.contentAccessGrants)
      .set({ revoked_at: new Date() })
      .where(
        and(
          eq(schema.contentAccessGrants.source_type, source.type),
          eq(schema.contentAccessGrants.source_id, source.id),
          isNull(schema.contentAccessGrants.revoked_at),
        ),
      );
  }

  async function grantEventContentAccess(input: {
    actorProfileId: string;
    granteeProfileId: string;
    eventId: string;
    activityPlanId?: string | null;
    trainingPlanId?: string | null;
  }) {
    const source: AccessSource = { type: "event", id: input.eventId };

    if (input.activityPlanId) {
      const plan = await findResource({ type: "activity_plan", id: input.activityPlanId });
      if (plan && needsContentGrantForRow(plan, input.granteeProfileId)) {
        await grantRead({
          actorProfileId: input.actorProfileId,
          granteeProfileId: input.granteeProfileId,
          resource: { type: "activity_plan", id: input.activityPlanId },
          source,
        });
      }

      if (plan?.routeId) {
        const route = await findResource({ type: "activity_route", id: plan.routeId });
        if (route && needsContentGrantForRow(route, input.granteeProfileId)) {
          await grantRouteGeometry({
            actorProfileId: input.actorProfileId,
            granteeProfileId: input.granteeProfileId,
            routeId: plan.routeId,
            source,
          });
        }
      }
    }

    if (input.trainingPlanId) {
      const trainingPlan = await findResource({ type: "training_plan", id: input.trainingPlanId });
      if (trainingPlan && needsContentGrantForRow(trainingPlan, input.granteeProfileId)) {
        await grantRead({
          actorProfileId: input.actorProfileId,
          granteeProfileId: input.granteeProfileId,
          resource: { type: "training_plan", id: input.trainingPlanId },
          source,
        });
      }
    }
  }

  return {
    can,
    require,
    canRead: (actorProfileId: string, resource: PermissionResource) =>
      can({ actorProfileId, action: "read", resource }),
    requireRead: (actorProfileId: string, resource: PermissionResource, message?: string) =>
      require({ actorProfileId, action: "read", resource, message }),
    canReadForRow,
    requireReadForRow,
    filterReadableRows,
    requireManage: (actorProfileId: string, resource: PermissionResource, message?: string) =>
      require({ actorProfileId, action: "manage", resource, message }),
    requireRouteGeometry: (actorProfileId: string, routeId: string, message?: string) =>
      require({
        actorProfileId,
        action: "read_geometry",
        resource: { type: "activity_route", id: routeId },
        message,
      }),
    grant,
    grantRead,
    grantRouteGeometry,
    revokeSource,
    revokeEventGrants: (eventId: string) => revokeSource({ type: "event", id: eventId }),
    grantEventContentAccess,
  };
}
