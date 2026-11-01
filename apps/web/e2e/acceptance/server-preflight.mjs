import { readFreshAcceptanceTarget, verifyFreshAcceptanceTarget } from "@repo/db/acceptance-target";
import { seedAcceptanceUser } from "./setup.ts";

try {
  // Verify and seed once, before the app can initialize.
  const target = readFreshAcceptanceTarget();
  await verifyFreshAcceptanceTarget(target);
  await seedAcceptanceUser(target.databaseUrl);
  await import("./server-launcher.mjs");
} catch {
  console.error(
    "[acceptance] server preflight refused the disposable target; Vite was not started.",
  );
  process.exitCode = 1;
}
