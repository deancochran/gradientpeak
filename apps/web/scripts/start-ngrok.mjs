import { spawn } from "node:child_process";

const expectedPublicUrl = "https://outgoing-ape-repeatedly.ngrok-free.app";
const expectedTarget = "http://localhost:3000";

async function hasMatchingLocalTunnel() {
  try {
    const response = await fetch("http://127.0.0.1:4040/api/tunnels", {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    const body = await response.json();
    return Array.isArray(body.tunnels)
      ? body.tunnels.some(
          (tunnel) =>
            tunnel?.public_url === expectedPublicUrl && tunnel?.config?.addr === expectedTarget,
        )
      : false;
  } catch {
    return false;
  }
}

function waitUntilStopped() {
  const timer = setInterval(() => {}, 2 ** 30);
  const stop = () => {
    clearInterval(timer);
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (await hasMatchingLocalTunnel()) {
  console.log(`[ngrok] reusing active tunnel ${expectedPublicUrl}`);
  waitUntilStopped();
} else {
  const child = spawn(
    "ngrok",
    ["http", "--domain=outgoing-ape-repeatedly.ngrok-free.app", "3000"],
    { stdio: "inherit" },
  );
  const forwardSignal = (signal) => child.kill(signal);
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));
  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
}
