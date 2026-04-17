import { createProviderSyncRepository } from "@repo/api/webhooks";
import { db } from "@repo/db/client";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isInternalProviderSyncAuthorized } from "../../../../../lib/internal-provider-sync-auth";

const retryBodySchema = z
  .object({
    jobId: z.string().uuid().optional(),
    receiptId: z.string().uuid().optional(),
  })
  .refine((value) => Boolean(value.jobId || value.receiptId), {
    message: "jobId or receiptId is required",
  })
  .strict();

export const Route = createFileRoute("/api/internal/provider-sync/wahoo/retry" as never)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isInternalProviderSyncAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsed = retryBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }

        const repository = createProviderSyncRepository({ db });
        const jobRetried = parsed.data.jobId ? await repository.retryJob(parsed.data.jobId) : false;
        const receiptRetried = parsed.data.receiptId
          ? await repository.retryWebhookReceipt(parsed.data.receiptId)
          : false;

        return Response.json({
          jobRetried,
          provider: "wahoo",
          receiptRetried,
          success: jobRetried || receiptRetried,
        });
      },
    },
  },
});
