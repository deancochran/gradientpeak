if (process.env.NODE_ENV !== "development" || process.env.WAHOO_DIRECT_DRAIN_LOCAL !== "true") {
  throw new Error("Direct Wahoo draining is restricted to explicit local development use.");
}

const secret = process.env.INTERNAL_PROVIDER_SYNC_SECRET;
if (!secret)
  throw new Error("INTERNAL_PROVIDER_SYNC_SECRET is required for local drain forwarding.");
const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const response = await fetch(new URL("/api/internal/provider-sync/wahoo/drain", baseUrl), {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
  signal: AbortSignal.timeout(9_000),
});
if (!response.ok) throw new Error("Internal Wahoo drain request failed");
const result = await response.json();

console.log(
  JSON.stringify(
    {
      drainedAt: new Date().toISOString(),
      provider: "wahoo",
      result,
    },
    null,
    2,
  ),
);

process.exit(0);
