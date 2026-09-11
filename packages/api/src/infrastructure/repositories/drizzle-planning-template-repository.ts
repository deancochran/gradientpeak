import {
  activityPlanDocumentSchema,
  activityPlanStructureSchema,
  compileActivityPlan,
  deriveSystemActivityTemplateActivityCategory,
  normalizeActivityTemplateStructureForAudit,
  resolveActivityPlanVariant,
  SYSTEM_TEMPLATES,
} from "@repo/core";
import type { DrizzleDbClient } from "@repo/db/client";
import { sql } from "drizzle-orm";
import { activityPlanDocumentHash } from "../../application/activity-plans/structure-hash";
import type { LockedPlanningTemplateRow, PlanningTemplateRepository } from "../../repositories";

function rows(result: unknown): Array<{
  gps_recording_enabled: boolean;
  id: string;
  is_system_template?: boolean;
  structure: unknown;
  structure_hash: string;
}> {
  return (
    (
      result as {
        rows?: Array<{
          gps_recording_enabled: boolean;
          id: string;
          is_system_template?: boolean;
          structure: unknown;
          structure_hash: string;
        }>;
      }
    ).rows ?? []
  ).filter((row) => typeof row.id === "string");
}

const catalogSignatures = new Map(
  SYSTEM_TEMPLATES.flatMap((source) => {
    const parsed = activityPlanStructureSchema.safeParse(source.structure);
    return parsed.success
      ? [
          [
            source.id,
            JSON.stringify(normalizeActivityTemplateStructureForAudit(parsed.data)),
          ] as const,
        ]
      : [];
  }),
);
const sourceMetadata = new Map(
  SYSTEM_TEMPLATES.map((template) => [
    template.id,
    {
      activityCategory: deriveSystemActivityTemplateActivityCategory(template.structure),
      gpsRecordingEnabled: template.gps_recording_enabled,
    },
  ]),
);

function isMatchingSystemTemplate(row: {
  gps_recording_enabled: boolean;
  id: string;
  structure: unknown;
  structure_hash: string;
}): boolean {
  const expectedSignature = catalogSignatures.get(row.id);
  const expectedMetadata = sourceMetadata.get(row.id);
  if (
    !expectedSignature ||
    !expectedMetadata ||
    row.gps_recording_enabled !== expectedMetadata.gpsRecordingEnabled
  ) {
    return false;
  }
  const parsed = activityPlanDocumentSchema.safeParse(row.structure);
  if (!parsed.success) return false;
  if (activityPlanDocumentHash(parsed.data) !== row.structure_hash) return false;
  const resolved = resolveActivityPlanVariant(parsed.data);
  if (
    compileActivityPlan(resolved.structure).activity_category !== expectedMetadata.activityCategory
  ) {
    return false;
  }
  return (
    resolved.variantId === row.id &&
    resolved.variantName === "Base" &&
    JSON.stringify(normalizeActivityTemplateStructureForAudit(resolved.structure)) ===
      expectedSignature
  );
}

export function createPlanningTemplateRepository(db: DrizzleDbClient): PlanningTemplateRepository {
  const listAvailablePublicSystemTemplateIds = async () => {
    const result = await db.execute(sql<{
      gps_recording_enabled: boolean;
      id: string;
      structure: unknown;
      structure_hash: string;
    }>`
      select id, structure, structure_hash, gps_recording_enabled
      from activity_plans
      where is_system_template = true
        and content_visibility = 'public'
      order by id asc
    `);
    return rows(result)
      .filter(isMatchingSystemTemplate)
      .map((row) => row.id)
      .sort((left, right) => left.localeCompare(right));
  };

  return {
    listAvailablePublicSystemTemplateIds,
    async assertAvailablePublicSystemTemplateIds(templateIds) {
      const requested = [...new Set(templateIds)].sort((left, right) => left.localeCompare(right));
      if (requested.length === 0) return { availableIds: [], missingIds: [] };
      const available = new Set(await listAvailablePublicSystemTemplateIds());
      return {
        availableIds: requested.filter((id) => available.has(id)),
        missingIds: requested.filter((id) => !available.has(id)),
      };
    },
    async withLockedPublishedTemplates(profileId, templateIds, operation) {
      const requested = [...new Set(templateIds)].sort((left, right) => left.localeCompare(right));
      return db.transaction(async (tx) => {
        const result = await tx.execute(sql<{
          gps_recording_enabled: boolean;
          id: string;
          is_system_template: boolean;
          structure: unknown;
          structure_hash: string;
        }>`
          select id, is_system_template, structure, structure_hash, gps_recording_enabled
          from activity_plans
          where id in (${sql.join(
            requested.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
            and (
              profile_id = ${profileId}::uuid
              or is_system_template = true
              or content_visibility = 'public'
              or (
                content_visibility = 'followers'
                and exists (
                  select 1 from follows f
                  where f.follower_id = ${profileId}::uuid
                    and f.following_id = activity_plans.profile_id
                    and f.status = 'accepted'
                )
              )
              or exists (
                select 1 from content_access_grants cag
                where cag.content_type = 'activity_plan'
                  and cag.content_id = activity_plans.id
                  and cag.grantee_profile_id = ${profileId}::uuid
                  and cag.access_level = 'read'
                  and cag.revoked_at is null
                  and (cag.expires_at is null or cag.expires_at > now())
              )
            )
          order by id asc
          for update
        `);
        const sourceRows = rows(result);
        const lockedRows: LockedPlanningTemplateRow[] = sourceRows.map((row) => {
          const parsed = activityPlanDocumentSchema.safeParse(row.structure);
          const activityCategory =
            parsed.success && activityPlanDocumentHash(parsed.data) === row.structure_hash
              ? compileActivityPlan(resolveActivityPlanVariant(parsed.data).structure)
                  .activity_category
              : "other";
          return {
            activityCategory,
            gpsRecordingEnabled: row.gps_recording_enabled,
            id: row.id,
            isSystemTemplate: row.is_system_template === true,
            structure: row.structure,
            structureHash: row.structure_hash,
          };
        });
        const availableIds = new Set(
          sourceRows
            .filter((row) => {
              const parsed = activityPlanDocumentSchema.safeParse(row.structure);
              if (
                typeof row.gps_recording_enabled !== "boolean" ||
                !parsed.success ||
                activityPlanDocumentHash(parsed.data) !== row.structure_hash
              ) {
                return false;
              }
              return row.is_system_template
                ? isMatchingSystemTemplate({
                    gps_recording_enabled: row.gps_recording_enabled,
                    id: row.id,
                    structure: parsed.data,
                    structure_hash: row.structure_hash,
                  })
                : true;
            })
            .map((row) => row.id),
        );
        const unavailableIds = requested.filter((id) => !availableIds.has(id));
        if (unavailableIds.length > 0) {
          throw new Error(
            `Training plan contains missing, inaccessible, unpublished, or changed activity plans: ${unavailableIds.join(", ")}`,
          );
        }
        return operation({ db: tx, rows: lockedRows });
      });
    },
  };
}
