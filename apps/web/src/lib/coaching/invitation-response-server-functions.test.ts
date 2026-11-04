import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  context: vi.fn(),
  preview: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
  list: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: ({ method }: { method: string }) => ({
    validator: (validate: (input: unknown) => unknown) => ({
      handler: (handler: (input: { data: unknown }) => unknown) =>
        Object.assign(async ({ data }: { data: unknown }) => handler({ data: validate(data) }), {
          method,
        }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeaders: () => new Headers() }));
vi.mock("@repo/auth/server", () => ({ resolveAuthSessionFromHeaders: m.auth }));
vi.mock("@repo/db/client", () => ({ db: {} }));
vi.mock("@repo/api/server", () => ({
  createApiContext: m.context,
  appRouter: {
    createCaller: () => ({
      organizations: {
        invitations: { preview: m.preview, accept: m.accept, decline: m.decline, listMine: m.list },
      },
    }),
  },
}));

import {
  acceptOrganizationInvitation,
  declineOrganizationInvitation,
  loadMyOrganizationInvitations,
  previewOrganizationInvitation,
} from "./invitation-response-server-functions";

const token = "x".repeat(43);
describe("invitation response server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ user: { id: "server-actor" } });
    m.context.mockResolvedValue({});
    m.list.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    m.preview.mockResolvedValue({
      invitationId: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      organizationName: "Peak",
      kind: "athlete",
      requestedRole: null,
      expiresAt: new Date(),
    });
    m.accept.mockResolvedValue({ status: "accepted" });
    m.decline.mockResolvedValue({ status: "declined" });
  });
  it("validates token before request caller and uses POST", async () => {
    await expect(previewOrganizationInvitation({ data: { token: "bad" } })).rejects.toThrow();
    expect(m.context).not.toHaveBeenCalled();
    expect((previewOrganizationInvitation as unknown as { method: string }).method).toBe("POST");
  });
  it("uses request authentication only and never accepts a client actor", async () => {
    await previewOrganizationInvitation({ data: { token } });
    expect(m.preview).toHaveBeenCalledWith({ token });
    await expect(
      previewOrganizationInvitation({ data: { token, actorId: "attacker" } as never }),
    ).rejects.toThrow();
  });
  it("keeps unavailable terminal results safe and forwards typed DTOs", async () => {
    m.preview.mockRejectedValue({ code: "FORBIDDEN" });
    await expect(previewOrganizationInvitation({ data: { token } })).resolves.toEqual({
      status: "unavailable",
    });
    await expect(
      loadMyOrganizationInvitations({ data: { limit: 20, cursor: null } }),
    ).resolves.toEqual({ items: [], nextCursor: null, hasMore: false });
  });
  it("posts accept and decline token commands", async () => {
    await acceptOrganizationInvitation({ data: { token } });
    await declineOrganizationInvitation({ data: { token } });
    expect(m.accept).toHaveBeenCalledWith({ token });
    expect(m.decline).toHaveBeenCalledWith({ token });
  });
  it.each([
    ["inbox", loadMyOrganizationInvitations],
    ["preview", previewOrganizationInvitation],
    ["accept", acceptOrganizationInvitation],
    ["decline", declineOrganizationInvitation],
  ])("keeps %s on the POST transport boundary", (_name, serverFunction) => {
    expect((serverFunction as unknown as { method: string }).method).toBe("POST");
  });
});
