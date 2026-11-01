import { spawn } from "node:child_process";

const requiredKeys = [
  "APP_URL",
  "AUTH_EMAIL_MODE",
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
  "NEXT_PRIVATE_SUPABASE_SECRET_KEY",
  "NEXT_PRIVATE_SUPABASE_URL",
  "NODE_ENV",
  "PATH",
  "POSTGRES_URL",
  "WEB_ACCEPTANCE",
];
const optionalKeys = ["HOME", "TMPDIR"];

const serverEnv = Object.fromEntries(
  [...requiredKeys, ...optionalKeys].flatMap((key) => {
    const value = process.env[key];
    return value == null ? [] : [[key, value]];
  }),
);

for (const key of requiredKeys) {
  if (!serverEnv[key]) {
    console.error(`[acceptance] refusing to start Vite without ${key}.`);
    process.exitCode = 1;
    break;
  }
}

if (process.exitCode) {
  // Do not invoke a shell or Vite when the explicit environment is incomplete.
} else {
  const child = spawn(
    "pnpm",
    ["exec", "vite", "dev", "--host", "127.0.0.1", "--port", "3100", "--strictPort"],
    { env: serverEnv, stdio: "inherit" },
  );

  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };

  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));
  process.once("exit", () => forwardSignal("SIGTERM"));

  child.once("error", (error) => {
    console.error(`[acceptance] failed to launch Vite: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
