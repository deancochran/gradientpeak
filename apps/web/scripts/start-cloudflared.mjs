import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const publicUrl = "https://dev.gradientpeak.com";
const tokenFile =
  process.env.CLOUDFLARE_TUNNEL_TOKEN_FILE ??
  join(homedir(), ".config", "gradientpeak", "gradientpeak-dev.tunnel-token");

if (!existsSync(tokenFile)) {
  console.error(
    `[cloudflared] tunnel token file is missing: ${tokenFile}\n` +
      "Create the named Cloudflare tunnel, save its token in that file, or set CLOUDFLARE_TUNNEL_TOKEN_FILE.",
  );
  process.exit(1);
}

if (process.platform !== "win32" && (statSync(tokenFile).mode & 0o077) !== 0) {
  console.error(`[cloudflared] tunnel token file must be readable only by its owner: ${tokenFile}`);
  process.exit(1);
}

console.log(`[cloudflared] starting ${publicUrl}`);
const child = spawn("cloudflared", ["tunnel", "run", "--token-file", tokenFile], {
  stdio: "inherit",
});

const forwardSignal = (signal) => child.kill(signal);
process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));
child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
