import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWahooSyncRepository: vi.fn(),
  isWahooIntegrationEnabled: vi.fn(),
  retryJob: vi.fn(),
  retryWebhookReceipt: vi.fn(),
}));

vi.mock("@repo/api/webhooks", () => ({
  createWahooSyncRepository: mocks.createWahooSyncRepository,
  isWahooIntegrationEnabled: mocks.isWahooIntegrationEnabled,
}));
vi.mock("@repo/db/client", () => ({ db: {} }));
vi.mock("../../../../../lib/internal-provider-sync-auth", () => ({
  isInternalProviderSyncAuthorized: () => true,
}));

describe("Wahoo retry route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isWahooIntegrationEnabled.mockReturnValue(true);
    mocks.createWahooSyncRepository.mockReturnValue({
      retryJob: mocks.retryJob,
      retryWebhookReceipt: mocks.retryWebhookReceipt,
    });
    mocks.retryJob.mockResolvedValue(true);
    mocks.retryWebhookReceipt.mockResolvedValue(true);
  });

  async function post(body: unknown) {
    const { Route } = await import("./retry");
    const handler = (
      Route.options as unknown as {
        server?: { handlers?: { POST?: (input: { request: Request }) => Promise<Response> } };
      }
    ).server?.handlers?.POST;
    if (!handler) throw new Error("Expected Wahoo retry POST handler");
    return handler({
      request: new Request("http://test/retry", {
        body: JSON.stringify(body),
        method: "POST",
      }),
    } as never);
  }

  it("returns not found before parsing or persistence when Wahoo is disabled", async () => {
    mocks.isWahooIntegrationEnabled.mockReturnValue(false);

    expect((await post("not-a-retry-body")).status).toBe(404);
    expect(mocks.createWahooSyncRepository).not.toHaveBeenCalled();
    expect(mocks.retryJob).not.toHaveBeenCalled();
  });

  it("passes explicit Wahoo identity to both retry entrypoints", async () => {
    const jobId = "00000000-0000-4000-8000-000000000001";
    const receiptId = "00000000-0000-4000-8000-000000000002";

    expect((await post({ jobId, receiptId })).status).toBe(200);
    expect(mocks.retryJob).toHaveBeenCalledWith({ id: jobId, provider: "wahoo" });
    expect(mocks.retryWebhookReceipt).toHaveBeenCalledWith({ id: receiptId, provider: "wahoo" });
  });
});
