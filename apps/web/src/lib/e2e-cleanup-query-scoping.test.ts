import { describe, expect, it } from "vitest";

import { E2E_CLEANUP_SQL } from "../../e2e/utils/testData";

const compact = (sql: string) => sql.replaceAll(/\s+/g, " ").trim();

describe("web E2E cleanup query scoping", () => {
  it("resolves the local actor through the configured auth email", () => {
    const sql = compact(E2E_CLEANUP_SQL.resolveActor);

    expect(sql).toContain('inner join "users" u on u."id" = p."id"');
    expect(sql).toContain('where lower(u."email") = lower($1)');
  });

  it("limits group cleanup to exact names owned by the resolved actor", () => {
    for (const sqlText of [E2E_CLEANUP_SQL.groupComments, E2E_CLEANUP_SQL.groups]) {
      const sql = compact(sqlText);
      expect(sql).toContain('"created_by_profile_id" = $1');
      expect(sql).toContain('"name" = any($2::text[])');
    }
  });

  it("limits plan, scheduled-event, and route cleanup to exact actor-owned identities", () => {
    for (const sqlText of [
      E2E_CLEANUP_SQL.activityPlanEventComments,
      E2E_CLEANUP_SQL.activityPlanEvents,
    ]) {
      const sql = compact(sqlText);
      expect(sql).toContain('e."profile_id" = $1');
      expect(sql).toContain('ap."profile_id" = $1 and ap."name" = any($2::text[])');
      expect(sql).toContain('ar."profile_id" = $1 and ar."name" = any($3::text[])');
    }

    for (const sqlText of [
      E2E_CLEANUP_SQL.activityPlanComments,
      E2E_CLEANUP_SQL.activityPlanLikes,
      E2E_CLEANUP_SQL.activityPlans,
    ]) {
      const sql = compact(sqlText);
      expect(sql).toContain('"profile_id" = $1');
      expect(sql).toContain('"name" = any($2::text[])');
    }

    for (const sqlText of [
      E2E_CLEANUP_SQL.activityRouteComments,
      E2E_CLEANUP_SQL.activityRouteLikes,
      E2E_CLEANUP_SQL.activityRoutes,
    ]) {
      const sql = compact(sqlText);
      expect(sql).toContain('"profile_id" = $1');
      expect(sql).toContain('"name" = any($2::text[])');
    }
  });
});
