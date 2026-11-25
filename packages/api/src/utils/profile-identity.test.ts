import { describe, expect, it, vi } from "vitest";

vi.mock("../application/storage/profile-media-url", () => ({
  resolveProfileMediaUrl: (value: string | null, profileId: string) =>
    value ? `https://storage.example.test/${profileId}/${value.split("/").at(-1)}` : null,
}));

import { loadProfileIdentityMap } from "./profile-identity";

describe("loadProfileIdentityMap", () => {
  it("normalizes avatar values before routes and plans receive profile identities", async () => {
    const rows = [
      { id: "11111111-1111-4111-8111-111111111111", username: "runner", avatar_url: "id/a.jpg" },
    ];
    const builder = {
      from: () => builder,
      where: () => Promise.resolve(rows),
    };
    const db = { select: () => builder };

    const identities = await loadProfileIdentityMap(db, [rows[0]?.id]);

    expect(identities.get(rows[0]?.id ?? "")).toEqual({
      ...rows[0],
      avatar_url: "https://storage.example.test/11111111-1111-4111-8111-111111111111/a.jpg",
    });
  });
});
