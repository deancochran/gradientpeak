import { readFile } from "node:fs/promises";
import { getLocalErrorLogPath } from "../src/local-error-log-path.mjs";

const path = getLocalErrorLogPath();

if (!path) {
  console.error(
    "LOCAL_ERROR_LOG_PATH must be an absolute file directly inside the repository .logs directory.",
  );
  process.exitCode = 1;
} else {
  try {
    const lines = (await readFile(path, "utf8")).trim().split("\n").filter(Boolean);
    const events = lines.slice(-100).flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
    if (events.length === 0) {
      console.log("No local errors recorded.");
    } else {
      const groups = new Map();
      for (const event of events) {
        const key = [event.procedure ?? "unknown", event.diagnostic_reason ?? "unexpected"].join(
          " | ",
        );
        groups.set(key, (groups.get(key) ?? 0) + 1);
      }
      for (const [key, count] of groups) console.log(`${count} ${key}`);
      console.log("Latest:", JSON.stringify(events.at(-1)));
    }
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT")
      console.log("No local errors recorded.");
    else process.exitCode = 1;
  }
}
