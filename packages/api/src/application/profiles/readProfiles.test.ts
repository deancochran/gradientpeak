import { describe, expect, it } from "vitest";

import { createQueryMapDbMock } from "../../test/mock-query-db";
import { listProfiles } from "./readProfiles";

describe("listProfiles", () => {
  it("returns a filtered page and builder-derived total", async () => {
    const { db, callLog } = createQueryMapDbMock({
      profiles: [
        {
          data: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              created_at: new Date("2026-01-01T00:00:00.000Z"),
              updated_at: new Date("2026-01-01T00:00:00.000Z"),
              email: "athlete@example.test",
              full_name: "Athlete",
              avatar_url: null,
              cover_url: null,
              bio: null,
              dob: null,
              gender: null,
              onboarding_status: "complete",
              is_public: true,
              username: "athlete",
              preferred_units: "metric",
              planning_timezone: "UTC",
              language: "en",
              default_content_visibility: "private",
            },
          ],
          error: null,
        },
        { data: [{ total: 1 }], error: null },
      ],
    });

    await expect(listProfiles(db as never, { username: "ath", limit: 20 })).resolves.toMatchObject({
      total: 1,
      items: [{ username: "athlete" }],
    });
    expect(callLog).toEqual([
      { table: "profiles", operation: "select" },
      { table: "profiles", operation: "select" },
    ]);
  });
});
