// Backward-compatible entrypoint. The shared loop now drains Wahoo and Garmin.
import { runProviderDrainLoop } from "./drain-provider-sync.mjs";

process.exitCode = await runProviderDrainLoop();
