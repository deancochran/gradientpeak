import { resolve } from "node:path";
import { scanCurrentContracts } from "./scanner.mjs";

const root = resolve(import.meta.dirname, "../..");
const violations = scanCurrentContracts(root);

if (violations.length) {
  console.error(
    `Current contract checker failed:\n${violations.map((item) => `- ${item}`).join("\n")}`,
  );
  process.exit(1);
}
console.log("Current contract checker passed.");
