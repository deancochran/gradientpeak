import { randomUUID } from "node:crypto";
import { db, pool } from "@repo/db/client";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityFileIngestions,
  profiles,
  users,
} from "@repo/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { recordingSessionActivityId } from "../../application/activities/submit-activity";
import { submitMobileRecording } from "../../application/activities/submit-mobile-recording";
import { activityArtifactSha256 } from "../../application/activity-file-ingestion/artifact-storage";
import { createApiContext } from "../../context";
import { getActivityArtifactStorageService } from "../../storage-service";
import { activityFilesRouter } from "../activity-files";

type Fixture = {
  canonicalPath: string;
  profileId: string;
  stagingPath: string;
};

const fixtures: Fixture[] = [];
const artifactStorage = getActivityArtifactStorageService();

async function createCallerContext(profileId: string, email: string) {
  return createApiContext({
    db,
    headers: new Headers({ "x-api-source": "vitest-live-db", "x-client-type": "server" }),
    auth: {
      session: {
        sessionId: randomUUID(),
        transport: "cookie",
        user: { id: profileId, email, emailVerified: true },
      },
    },
  });
}

async function seedProfile(): Promise<{ email: string; profileId: string }> {
  const profileId = randomUUID();
  const email = `${profileId}@gradientpeak.test`;
  const now = new Date("2026-07-24T08:00:00.000Z");
  await db.insert(users).values({
    id: profileId,
    name: "Mobile Recording Storage Live DB Test",
    email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(profiles).values({
    id: profileId,
    email,
    full_name: "Mobile Recording Storage Live DB Test",
    username: `mobile-storage-${profileId.slice(0, 8)}`,
    onboarded: true,
    is_public: false,
    planning_timezone: "UTC",
    created_at: now,
    updated_at: now,
  });
  return { email, profileId };
}

async function cleanupFixture(fixture: Fixture) {
  await artifactStorage.storage
    .from("activity-files")
    .remove([fixture.stagingPath, fixture.canonicalPath]);
  await db.transaction(async (tx) => {
    await tx.delete(activities).where(eq(activities.profile_id, fixture.profileId));
    await tx.execute(
      sql`select set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true)`,
    );
    await tx
      .update(activityArtifacts)
      .set({ availability: "deletion_pending", deletion_requested_at: new Date() })
      .where(eq(activityArtifacts.profile_id, fixture.profileId));
    await tx
      .update(activityArtifacts)
      .set({ availability: "deleted", deleted_at: new Date() })
      .where(eq(activityArtifacts.profile_id, fixture.profileId));
    await tx.execute(
      sql`select set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true)`,
    );
    await tx.delete(activityArtifacts).where(eq(activityArtifacts.profile_id, fixture.profileId));
  });
  await db.delete(profiles).where(eq(profiles.id, fixture.profileId));
  await db.delete(users).where(eq(users.id, fixture.profileId));
}

afterEach(async () => {
  while (fixtures.length) {
    const fixture = fixtures.pop();
    if (fixture) await cleanupFixture(fixture);
  }
});

afterAll(async () => {
  await pool.end();
});

describe("mobile recording storage live-db", () => {
  it("accepts one upload claim once, promotes its bytes, and safely replays a lost response", async () => {
    const { email, profileId } = await seedProfile();
    const recordingSessionId = `live-db-${randomUUID()}`;
    const bytes = new TextEncoder().encode("GradientPeak mobile recording live-db artifact v1\n");
    const sha256 = activityArtifactSha256(bytes);
    const activityId = recordingSessionActivityId(profileId, recordingSessionId);
    const canonicalPath = `artifacts/sha256/${profileId}/${sha256}`;
    const stagingPath = `mobile-recordings/${profileId}/${activityId}.fit`;
    fixtures.push({ canonicalPath, profileId, stagingPath });
    const caller = activityFilesRouter.createCaller(await createCallerContext(profileId, email));
    const claim = await caller.beginMobileRecordingUpload({
      recordingSessionId,
      byteSize: bytes.byteLength,
      sha256,
      format: "fit",
    });

    expect(claim.status).toBe("upload");
    if (claim.status !== "upload") throw new Error("Expected a new recording upload claim");
    expect(claim.activityId).toBe(activityId);

    const upload = await fetch(claim.signedUrl, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: bytes,
    });
    expect(upload.ok).toBe(true);

    const submission = {
      artifactSource: "uploadedArtifact" as const,
      profileId,
      recordingSessionId,
      name: "Mobile storage recording",
      startedAt: "2026-07-24T08:00:00.000Z",
      finishedAt: "2026-07-24T09:00:00.000Z",
      executionManifest: {
        version: 1 as const,
        compilerVersion: 1,
        planHash: "b".repeat(64),
        occurrences: [
          {
            occurrenceId: randomUUID(),
            globalOrdinal: 0,
            segmentId: randomUUID(),
            role: "activity" as const,
            activity_category: "run" as const,
            startedAt: "2026-07-24T08:00:00.000Z",
            completedAt: "2026-07-24T09:00:00.000Z",
            activeSeconds: 3600,
            movingSeconds: 3500,
            distanceMeters: 10_000,
            timerEvents: [],
            laps: [],
          },
        ],
      },
      uploadedArtifact: { ingestionId: claim.ingestionId },
      summary: { distanceMeters: 10_000 },
      source: "mobile_recording" as const,
    };

    const first = await submitMobileRecording(db, artifactStorage, {
      actorProfileId: profileId,
      submission,
    });
    const replay = await submitMobileRecording(db, artifactStorage, {
      actorProfileId: profileId,
      submission,
    });

    expect(replay.activity).toEqual(first.activity);
    expect(replay.acceptedArtifact).toEqual(first.acceptedArtifact);
    expect(replay.ingestion).toMatchObject({
      id: first.ingestion.id,
      status: "ready",
      staging_cleanup_pending: false,
    });
    expect(first.acceptedArtifact).toMatchObject({
      sha256,
      byteSize: bytes.byteLength,
      bucket: "activity-files",
      path: canonicalPath,
    });

    const [persistedActivities, persistedArtifacts, persistedIngestions, persistedLinks] =
      await Promise.all([
        db.select().from(activities).where(eq(activities.profile_id, profileId)),
        db.select().from(activityArtifacts).where(eq(activityArtifacts.profile_id, profileId)),
        db
          .select()
          .from(activityFileIngestions)
          .where(
            and(
              eq(activityFileIngestions.profile_id, profileId),
              eq(activityFileIngestions.source, "mobile_recording"),
            ),
          ),
        db
          .select()
          .from(activityArtifactLinks)
          .where(eq(activityArtifactLinks.profile_id, profileId)),
      ]);

    expect(persistedActivities).toHaveLength(1);
    expect(persistedArtifacts).toHaveLength(1);
    expect(persistedIngestions).toHaveLength(1);
    expect(persistedLinks).toHaveLength(1);
    expect(persistedIngestions[0]).toMatchObject({
      id: claim.ingestionId,
      activity_id: first.activity.id,
      artifact_id: persistedArtifacts[0]?.id,
      status: "ready",
      accepted_sha256: sha256,
      accepted_byte_size: bytes.byteLength,
      accepted_path: canonicalPath,
      staging_cleanup_pending: false,
    });
    expect(persistedArtifacts[0]).toMatchObject({
      digest: sha256,
      byte_size: bytes.byteLength,
      bucket: "activity-files",
      path: canonicalPath,
      availability: "accepted",
    });
    expect(persistedLinks[0]).toMatchObject({
      activity_id: first.activity.id,
      artifact_id: persistedArtifacts[0]?.id,
      role: "source",
      is_current: true,
    });

    await expect(
      artifactStorage.readObjectBounded({
        bucket: "activity-files",
        path: canonicalPath,
        maxBytes: bytes.byteLength,
      }),
    ).resolves.toMatchObject({ data: bytes });
    await expect(
      artifactStorage.readObjectBounded({
        bucket: "activity-files",
        path: stagingPath,
        maxBytes: bytes.byteLength,
      }),
    ).rejects.toThrow("Failed to read activity artifact from storage.");
  });
});
