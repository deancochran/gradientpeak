import { execSync } from "child_process";
try {
  console.log(
    execSync(
      "npx vitest run packages/core/plan/recommendation/__tests__/engine.test.ts",
      { encoding: "utf-8" },
    ),
  );
} catch (e) {
  console.error(e.stdout);
  console.error(e.stderr);
}
