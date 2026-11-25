import { describe, expect, it, vi } from "vitest";
import { createStravaCompletedActivityExternalId } from "../../lib/integrations/strava/upload";
import { importStravaActivity } from "./import-strava-activity";

const activityId = "11111111-1111-4111-8111-111111111111";
const profileId = "22222222-2222-4222-8222-222222222222";
const integrationId = "33333333-3333-4333-8333-333333333333";
const secret = "test-only-export-identity-secret-32-bytes";

describe("importStravaActivity outbound echo convergence", () => {
  it("reuses the local identity and converges a late echo after dispatch became uncertain", async () => {
    const submitCanonicalActivity = vi.fn(async () => ({ activity: { id: activityId } }) as never);
    const findCompletedActivityUploadEcho = vi.fn(async () => ({ activityId }));
    const convergeCompletedActivityUploadEcho = vi.fn(async () => true);
    const externalId = createStravaCompletedActivityExternalId({
      activityId,
      artifactRevision: "a".repeat(64),
      destination: `strava:${integrationId}:2`,
      profileId,
      secret,
    });

    await importStravaActivity(
      {
        activity: {
          athlete: { id: 7 },
          distance: 2_000,
          elapsed_time: 600,
          external_id: `${externalId}.fit`,
          id: 987,
          moving_time: 590,
          name: "Uploaded run",
          start_date: "2026-09-01T10:00:00Z",
          type: "Run",
        },
        db: {} as never,
        integrationGeneration: 2,
        integrationId,
        profileId,
        providerUpdatedAt: null,
        streams: {},
      },
      {
        convergeCompletedActivityUploadEcho,
        findCompletedActivityUploadEcho,
        submitCanonicalActivity: submitCanonicalActivity as never,
      },
    );

    expect(findCompletedActivityUploadEcho).toHaveBeenCalledWith({
      externalId: `${externalId}.fit`,
      integrationGeneration: 2,
      integrationId,
      profileId,
    });
    expect(convergeCompletedActivityUploadEcho).toHaveBeenCalledWith({
      activityId,
      externalId: `${externalId}.fit`,
      integrationGeneration: 2,
      integrationId,
      profileId,
      providerExternalId: "987",
    });

    expect(submitCanonicalActivity).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        profileId,
        providerProvenance: expect.objectContaining({
          connector: { connectorId: "strava", externalId: "987" },
          source: {
            sourceId: "gradientpeak",
            externalId: `strava:${activityId}`,
          },
          relationshipKind: "exported",
        }),
        requestedActivityId: activityId,
      }),
      expect.any(Object),
    );
  });
});
