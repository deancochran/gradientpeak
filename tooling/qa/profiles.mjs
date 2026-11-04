export const QA_PROFILES = ["static", "db", "web", "full"];

export const directCiSmokeReferences = {
  web: {
    identity: "dashboard presents an explicit error and recovers its server content",
    kind: "playwright",
    path: "apps/web/e2e/specs/smoke.spec.ts",
  },
};

export const ciRuntimeProfileCommands = Object.fromEntries(
  ["db", "web"].map((profile) => [profile, `pnpm qa:run --profile ${profile} --integration-only`]),
);

export function validateCiRuntimeDelegation(workflowSource) {
  const issues = [];
  for (const [profile, expectedCommand] of Object.entries(ciRuntimeProfileCommands)) {
    const job = `runtime-${profile}`;
    const match = workflowSource.match(
      new RegExp(`^  ${job}:\\n([\\s\\S]*?)(?=^  [a-z][\\w-]*:\\n|(?![\\s\\S]))`, "m"),
    );
    if (!match) {
      issues.push(`CI workflow is missing the ${job} job`);
      continue;
    }
    const commandCount = match[1]
      .split("\n")
      .map((line) => line.trim().replace(/^run:\s*/, ""))
      .filter((line) => line === expectedCommand).length;
    if (commandCount !== 1) {
      issues.push(`${job} must execute exactly once: ${expectedCommand}`);
    }
  }
  for (const reference of Object.values(directCiSmokeReferences)) {
    const appRelativePath = reference.path.replace(/^apps\/(?:web|mobile)\//, "");
    if (workflowSource.includes(appRelativePath)) {
      issues.push(`CI workflow duplicates the QA-owned smoke reference: ${reference.path}`);
    }
  }
  return issues;
}

const webSmoke = [
  "pnpm",
  [
    "test:e2e:web",
    directCiSmokeReferences.web.path.replace("apps/web/", ""),
    "--project=Desktop Chrome",
    "--grep",
    directCiSmokeReferences.web.identity,
  ],
];
const dbCheck = [
  "pnpm",
  [
    "--filter",
    "@repo/api",
    "test:live-db",
    "src/routers/__tests__/public-share-visibility.live-db.test.ts",
  ],
];

const commands = {
  static: [["pnpm", ["quality:agent:static"]]],
  db: [["pnpm", ["quality:agent:db:static"]], dbCheck],
  web: [["pnpm", ["quality:agent:static"]], webSmoke],
  full: [["pnpm", ["quality:agent:db:static"]], dbCheck, webSmoke],
};

function command([executable, args]) {
  return { command: executable, args };
}

export function profileForPaths(paths) {
  if (paths.length === 0) return "static";
  const areas = new Set();
  for (const changedPath of paths) {
    if (/^(?:docs\/.*\.(?:md|mdx)|README\.md)$/.test(changedPath)) continue;
    if (
      /^tooling\/qa\/(?:cli|profiles)\.mjs$/.test(changedPath) ||
      /^\.github\/workflows\/ci\.yml$/.test(changedPath)
    ) {
      areas.add("full");
    } else if (/^(?:packages\/(?:api|db)\/|supabase\/)/.test(changedPath)) areas.add("db");
    else if (/^apps\/web\//.test(changedPath)) areas.add("web");
    else if (/^apps\/mobile\//.test(changedPath)) areas.add("static");
    else if (/^packages\/(?:auth|core|ui)\//.test(changedPath)) {
      areas.add("web");
    } else if (/^(?:tooling\/|\.github\/)/.test(changedPath)) areas.add("static");
    else areas.add("full");
  }
  if (areas.size === 0 || (areas.size === 1 && areas.has("static"))) return "static";
  areas.delete("static");
  if (areas.has("full") || areas.size > 1) return "full";
  if (areas.has("db")) return "db";
  if (areas.has("web")) return "web";
  return "static";
}

export function createProfilePlan({ profile, changedPaths = [], includeStatic = true } = {}) {
  if (profile !== undefined && !QA_PROFILES.includes(profile)) {
    throw new Error(`Unknown QA profile "${profile}". Choose: ${QA_PROFILES.join(", ")}.`);
  }
  if (
    !Array.isArray(changedPaths) ||
    changedPaths.some((changedPath) => typeof changedPath !== "string")
  ) {
    throw new Error("Changed paths must be strings.");
  }
  const selectedProfile = profile ?? profileForPaths(changedPaths);
  return {
    profile: selectedProfile,
    changedPaths: [...new Set(changedPaths)].sort(),
    commands: (includeStatic ? commands[selectedProfile] : commands[selectedProfile].slice(1)).map(
      command,
    ),
  };
}

export function formatProfilePlan(plan) {
  return [
    `QA profile: ${plan.profile}`,
    `Changed paths: ${plan.changedPaths.length}`,
    ...plan.commands.map(({ command: executable, args }) => `  ${[executable, ...args].join(" ")}`),
    "",
  ].join("\n");
}
