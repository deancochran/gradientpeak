import { describe, expect, it, vi } from "vitest";
import { listProfileCurrentAcceptedActivityArtifacts } from "./profile-accepted-activity-artifact-repository";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

function createDb(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.limit = vi.fn(async () => rows);
  return { db: { select: vi.fn(() => builder) } as never, select: builder };
}

describe("profile accepted activity artifact reader", () => {
  it("scopes every joined owner and selects only current accepted source artifacts", async () => {
    const { db, select } = createDb([]);

    await listProfileCurrentAcceptedActivityArtifacts(db, {
      profileId: PROFILE_ID,
      limit: 25,
    });

    expect(select.where).toHaveBeenCalledOnce();
    expect(select.groupBy).toHaveBeenCalledOnce();
    expect(select.orderBy).toHaveBeenCalledOnce();
    expect(select.limit).toHaveBeenCalledWith(25);
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
    const { db } = createDb([
      {
        activityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        artifacts: [artifact, { ...artifact, artifactId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }],
        finishedAt: new Date("2026-01-01T01:00:00.000Z"),
        segmentsRevision: 1,
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    await expect(
      listProfileCurrentAcceptedActivityArtifacts(db, {
        profileId: PROFILE_ID,
        limit: 25,
      }),
    ).rejects.toThrow("exactly one current accepted source artifact");
  });
});
