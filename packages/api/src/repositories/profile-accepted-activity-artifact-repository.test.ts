import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { listProfileCurrentAcceptedActivityArtifacts } from "./profile-accepted-activity-artifact-repository";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

describe("profile accepted activity artifact reader", () => {
  it("scopes every joined owner and selects only current accepted source artifacts", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });

    await listProfileCurrentAcceptedActivityArtifacts({ execute } as never, {
      profileId: PROFILE_ID,
      limit: 25,
    });

    const query = new PgDialect().sqlToQuery(execute.mock.calls[0]?.[0] as never);
    const normalized = query.sql.replace(/\s+/g, " ");
    expect(normalized).toContain('"activities"."profile_id" =');
    expect(normalized).toContain('"activity_artifact_links"."profile_id" =');
    expect(normalized).toContain('"activity_artifacts"."profile_id" =');
    expect(normalized).toContain('"activity_artifact_links"."role" = \'source\'');
    expect(normalized).toContain('"activity_artifact_links"."is_current" = true');
    expect(normalized).toContain('"activity_artifacts"."availability" = \'accepted\'');
    expect(normalized).toContain('"activity_artifacts"."deletion_requested_at" is null');
    expect(normalized).toContain('order by "activities"."started_at", "activities"."id"');
    expect(query.params.filter((value) => value === PROFILE_ID)).toHaveLength(3);
  });

  it("fails closed instead of choosing among multiple current accepted sources", async () => {
    const artifact = {
      artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      bucket: "activity-files",
      byteSize: 3,
      digest: "a".repeat(64),
      format: "fit",
      mediaType: "application/vnd.ant.fit",
      path: `artifacts/sha256/${PROFILE_ID}/${"a".repeat(64)}`,
    };
    const execute = vi.fn().mockResolvedValue({
      rows: [
        {
          activityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          artifacts: [
            artifact,
            { ...artifact, artifactId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
          ],
          finishedAt: new Date("2026-01-01T01:00:00.000Z"),
          segmentsRevision: 1,
          startedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
    });

    await expect(
      listProfileCurrentAcceptedActivityArtifacts({ execute } as never, {
        profileId: PROFILE_ID,
        limit: 25,
      }),
    ).rejects.toThrow("exactly one current accepted source artifact");
  });
});
