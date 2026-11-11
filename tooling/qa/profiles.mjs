export const QA_PROFILES = ["static", "db", "web", "full"];

export const directCiSmokeReferences = {
  web: {
    identity: "dashboard presents an explicit error and recovers its server content",
    kind: "playwright",
    path: "apps/web/e2e/specs/smoke.spec.ts",
  },
};

const webSmoke = [
  "pnpm",
  [
    "--filter",
    "web",
    "exec",
    "tsx",
    "scripts/run-disposable-acceptance.ts",
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
const dbDisposableRunnerCheck = [
  "pnpm",
  ["--filter", "@repo/api", "test:live-db:runner:disposable"],
];

const commands = {
  static: [["pnpm", ["quality:agent:static"]]],
  db: [["pnpm", ["quality:agent:db:static"]], dbCheck, dbDisposableRunnerCheck],
  web: [["pnpm", ["quality:agent:static"]], webSmoke],
  full: [["pnpm", ["quality:agent:db:static"]], dbCheck, dbDisposableRunnerCheck, webSmoke],
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
