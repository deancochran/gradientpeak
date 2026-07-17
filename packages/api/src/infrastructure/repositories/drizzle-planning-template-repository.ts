import {
  activityPlanStructureSchemaV3,
  buildSystemActivityTemplateCatalog,
  compileActivityPlanV3,
  normalizeActivityTemplateStructureForAudit,
  SYSTEM_TEMPLATES,
} from "@repo/core";
import type { DrizzleDbClient } from "@repo/db/client";
import { sql } from "drizzle-orm";
import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
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
  buildSystemActivityTemplateCatalog().flatMap((candidate) => {
    const source = SYSTEM_TEMPLATES.find((template) => template.id === candidate.template_id);
    const parsed = activityPlanStructureSchemaV3.safeParse(source?.structure);
    return parsed.success
      ? [
          [
            candidate.template_id,
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
      activityCategory: template.activity_category,
      gpsRecordingEnabled: template.gps_recording_enabled,
    },
  ]),
);

function isMatchingV3SystemTemplate(row: {
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
  const parsed = activityPlanStructureSchemaV3.safeParse(row.structure);
  if (!parsed.success) return false;
  if (activityPlanStructureHash(parsed.data) !== row.structure_hash) return false;
  if (compileActivityPlanV3(parsed.data).primaryCategory !== expectedMetadata.activityCategory) {
    return false;
  }
  return (
    JSON.stringify(normalizeActivityTemplateStructureForAudit(parsed.data)) === expectedSignature
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
        and template_visibility = 'public'
      order by id asc
    `);
    return rows(result)
      .filter(isMatchingV3SystemTemplate)
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
    async withLockedPublishedTemplates(templateIds, operation) {
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
            and (template_visibility = 'public' or is_system_template = true)
          order by id asc
          for update
        `);
        const sourceRows = rows(result);
        const lockedRows: LockedPlanningTemplateRow[] = sourceRows.map((row) => {
          const parsed = activityPlanStructureSchemaV3.safeParse(row.structure);
          const activityCategory =
            parsed.success && activityPlanStructureHash(parsed.data) === row.structure_hash
              ? compileActivityPlanV3(parsed.data).primaryCategory
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
              const parsed = activityPlanStructureSchemaV3.safeParse(row.structure);
              if (
                typeof row.gps_recording_enabled !== "boolean" ||
                !parsed.success ||
                activityPlanStructureHash(parsed.data) !== row.structure_hash
              ) {
                return false;
              }
              return row.is_system_template
                ? isMatchingV3SystemTemplate({
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
