import { profileMetrics } from "@repo/db";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import type { getRequiredDb } from "../../db";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";

type DbClient = ReturnType<typeof getRequiredDb>;

export type ListProfileMetricHistoryInput = {
  metric_type?: (typeof profileMetrics.$inferSelect)["metric_type"];
  start_date?: Date;
  end_date?: Date;
  limit: number;
  cursor?: string;
};

export async function listProfileMetricHistory(
  db: DbClient,
  profileId: string,
  input: ListProfileMetricHistoryInput,
) {
  const offset = parseIndexCursor(input.cursor);
  const conditions = [eq(profileMetrics.profile_id, profileId)];

  if (input.metric_type) conditions.push(eq(profileMetrics.metric_type, input.metric_type));
  if (input.start_date) conditions.push(gte(profileMetrics.recorded_at, input.start_date));
  if (input.end_date) conditions.push(lte(profileMetrics.recorded_at, input.end_date));

  const whereClause = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(profileMetrics)
      .where(whereClause)
      .orderBy(desc(profileMetrics.recorded_at))
      .limit(input.limit)
      .offset(offset),
    db.select({ total: count() }).from(profileMetrics).where(whereClause),
  ]);
  const total = Number(totalRows[0]?.total ?? 0);

  return {
    items,
    total,
    ...buildIndexPageInfo({ offset, limit: input.limit, total }),
  };
}
