import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  directory: vi.fn(),
  end: vi.fn(),
  overview: vi.fn(),
  createApiContext: vi.fn(),
  resolveSession: vi.fn(),
  headers: new Headers(),
  db: {},
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: ({ method }: { method: string }) => ({
    validator: (validate: (v: unknown) => unknown) => ({
      handler: (handler: (input: { data: unknown }) => Promise<unknown>) =>
        Object.assign(async ({ data }: { data: unknown }) => handler({ data: validate(data) }), {
          method,
        }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeaders: () => mocks.headers }));
vi.mock("@repo/api/server", () => ({
  appRouter: {
    createCaller: () => ({
      organizations: {
        coachAthletes: { listAssigned: mocks.directory },
        lifecycle: { adminRoster: { list: mocks.list }, endEngagement: mocks.end },
      },
      athleteIntelligence: { getOrganizationReadModel: mocks.overview },
    }),
  },
  createApiContext: mocks.createApiContext,
}));
vi.mock("@repo/auth/server", () => ({ resolveAuthSessionFromHeaders: mocks.resolveSession }));
vi.mock("@repo/db/client", () => ({ db: mocks.db }));

import {
  loadAdministrativeAthleteRoster,
  loadCoachAthleteOverview,
  loadOrganizationAthletesLanding,
  terminateAthleteEngagement,
} from "./athletes-server-functions";

const organizationId = "11111111-1111-4111-8111-111111111111";
const engagementId = "22222222-2222-4222-8222-222222222222";
const correlationId = "33333333-3333-4333-8333-333333333333";

describe("athlete administration server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSession.mockResolvedValue({ user: { id: "profile" } });
    mocks.createApiContext.mockResolvedValue({});
    mocks.list.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.end.mockResolvedValue({ engagementId, status: "ended" });
    mocks.overview.mockResolvedValue({
      publishedState: null,
      status: null,
      loadHistory: null,
    });
  });

  it("binds roster pagination to the explicit organization and current request session", async () => {
    await loadAdministrativeAthleteRoster({ data: { organizationId, limit: 20, cursor: null } });
    expect(mocks.list).toHaveBeenCalledWith({ organizationId, limit: 20, cursor: null });
    expect(mocks.createApiContext).toHaveBeenCalledWith({
      headers: mocks.headers,
      auth: { session: { user: { id: "profile" } } },
      db: mocks.db,
    });
  });

  it("forwards only the selected organization athlete metrics request including bounded published history", async () => {
    await loadCoachAthleteOverview({ data: { organizationId, athleteProfileId: engagementId } });

    expect(mocks.overview).toHaveBeenNthCalledWith(1, {
      organizationId,
      athleteProfileId: engagementId,
      sections: { publishedState: true, status: true },
    });
    expect(mocks.overview).toHaveBeenNthCalledWith(2, {
      organizationId,
      athleteProfileId: engagementId,
      sections: { loadHistory: true },
    });
  });

  it("removes all overview data when organization assignment or consent is revoked", async () => {
    mocks.overview.mockRejectedValue(Object.assign(new Error("revoked"), { code: "FORBIDDEN" }));

    await expect(
      loadCoachAthleteOverview({ data: { organizationId, athleteProfileId: engagementId } }),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("keeps activity history when only metrics consent is denied", async () => {
    const history = {
      loadHistory: { publishedRevision: 1, algorithmVersion: "load-v1", result: {} },
    };
    mocks.overview
      .mockRejectedValueOnce(Object.assign(new Error("metrics revoked"), { code: "FORBIDDEN" }))
      .mockResolvedValueOnce(history);

    await expect(
      loadCoachAthleteOverview({ data: { organizationId, athleteProfileId: engagementId } }),
    ).resolves.toEqual({
      status: "granted",
      model: { metricsAvailable: false, publishedState: null, loadHistory: history.loadHistory },
    });
  });

  it("keeps metrics when only activity-history consent is denied", async () => {
    mocks.overview
      .mockResolvedValueOnce({ publishedState: null, status: null })
      .mockRejectedValueOnce(Object.assign(new Error("history revoked"), { code: "FORBIDDEN" }));

    await expect(
      loadCoachAthleteOverview({ data: { organizationId, athleteProfileId: engagementId } }),
    ).resolves.toEqual({
      status: "granted",
      model: { metricsAvailable: true, publishedState: null, loadHistory: null },
    });
  });

  it("propagates unexpected overview read failures", async () => {
    mocks.overview.mockRejectedValueOnce(new Error("upstream unavailable"));

    await expect(
      loadCoachAthleteOverview({ data: { organizationId, athleteProfileId: engagementId } }),
    ).rejects.toThrow("upstream unavailable");

    mocks.overview
      .mockResolvedValueOnce({ publishedState: null, status: null })
      .mockRejectedValueOnce(new Error("history upstream unavailable"));
    await expect(
      loadCoachAthleteOverview({ data: { organizationId, athleteProfileId: engagementId } }),
    ).rejects.toThrow("history upstream unavailable");
  });

  it("discards directory search and profile cursor when falling back to the engagement roster", async () => {
    mocks.directory.mockRejectedValueOnce(
      Object.assign(new Error("coach role revoked"), { code: "FORBIDDEN" }),
    );
    await expect(
      loadOrganizationAthletesLanding({
        data: { organizationId, limit: 20, cursor: correlationId, search: "Ada" },
      }),
    ).resolves.toMatchObject({ status: "administration" });
    expect(mocks.list).toHaveBeenCalledWith({ organizationId, limit: 20, cursor: null });
  });

  it("rejects scope injection before calling the API", async () => {
    await expect(
      loadAdministrativeAthleteRoster({
        data: { organizationId, limit: 20, cursor: null, profileId: "x" } as never,
      }),
    ).rejects.toThrow();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("passes the confirmed command including its stable correlation ID", async () => {
    await terminateAthleteEngagement({
      data: { organizationId, engagementId, reason: "administrative_termination", correlationId },
    });
    expect(mocks.end).toHaveBeenCalledWith({
      organizationId,
      engagementId,
      reason: "administrative_termination",
      correlationId,
    });
  });

  it("fails closed after a stale tenant response", async () => {
    mocks.list.mockRejectedValue(Object.assign(new Error("revoked"), { code: "FORBIDDEN" }));
    await expect(
      loadAdministrativeAthleteRoster({ data: { organizationId, limit: 20, cursor: null } }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("fails closed for an expired session on both the cached-roster read and termination", async () => {
    mocks.list.mockRejectedValue(Object.assign(new Error("expired"), { code: "UNAUTHORIZED" }));
    mocks.end.mockRejectedValue(Object.assign(new Error("expired"), { code: "UNAUTHORIZED" }));

    await expect(
      loadAdministrativeAthleteRoster({ data: { organizationId, limit: 20, cursor: null } }),
    ).resolves.toEqual({ status: "forbidden" });
    await expect(
      terminateAthleteEngagement({
        data: { organizationId, engagementId, reason: "administrative_termination", correlationId },
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });
});
