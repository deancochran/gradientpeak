export const QA_PROFILES = ["static", "db", "web", "mobile", "full"];

const commands = {
  static: [["pnpm", ["quality:agent"]]],
  db: [["pnpm", ["quality:agent:db"]]],
  web: [
    ["pnpm", ["quality:agent"]],
    ["pnpm", ["dev:e2e:web"], "start", 3000],
    ["pnpm", ["test:e2e:web"]],
  ],
  mobile: [
    ["pnpm", ["quality:agent"]],
    ["pnpm", ["--filter", "mobile", "dev:e2e"], "start", 8081],
    ["pnpm", ["--filter", "mobile", "test:e2e"]],
  ],
  full: [
    ["pnpm", ["quality:agent:db"]],
    ["pnpm", ["dev:e2e:web"], "start", 3000],
    ["pnpm", ["--filter", "mobile", "dev:e2e"], "start", 8081],
    ["pnpm", ["test:e2e:web"]],
    ["pnpm", ["--filter", "mobile", "test:e2e"]],
  ],
};

function command([command, args, phase = "run", port]) {
  return { command, args, phase, ...(port ? { port } : {}) };
}

export function profileForPaths(paths) {
  if (paths.length === 0) return "static";
  const areas = new Set();
  for (const path of paths) {
    if (/^(packages\/db\/|supabase\/)/.test(path)) areas.add("db");
    else if (/^apps\/web\//.test(path)) areas.add("web");
    else if (/^apps\/mobile\//.test(path)) areas.add("mobile");
    else if (
      /^(packages\/(api|auth|core|ui)\/|package\.json$|pnpm-workspace\.yaml$|turbo\.json$|tooling\/)/.test(
        path,
      )
    ) {
      areas.add("cross");
    } else if (!/^(docs\/.*\.(?:md|mdx)|README\.md)$/.test(path)) areas.add("cross");
  }
  if (areas.has("cross") || areas.size > 1) return "full";
  if (areas.has("db")) return "db";
  if (areas.has("web")) return "web";
  if (areas.has("mobile")) return "mobile";
  return "static";
}

export function createProfilePlan({ profile, changedPaths = [] } = {}) {
  if (profile !== undefined && !QA_PROFILES.includes(profile)) {
    throw new Error(`Unknown QA profile "${profile}". Choose: ${QA_PROFILES.join(", ")}.`);
  }
  if (!Array.isArray(changedPaths) || changedPaths.some((path) => typeof path !== "string")) {
    throw new Error("Changed paths must be strings.");
  }
  const selectedProfile = profile ?? profileForPaths(changedPaths);
  return {
    profile: selectedProfile,
    changedPaths: [...new Set(changedPaths)].sort(),
    commands: commands[selectedProfile].map(command),
    cleanup:
      selectedProfile === "mobile" || selectedProfile === "full"
        ? [command(["pnpm", ["--filter", "mobile", "test:e2e:clean"]])]
        : [],
  };
}

export function formatProfilePlan(plan) {
  return [
    `QA profile: ${plan.profile}`,
    `Changed paths: ${plan.changedPaths.length}`,
    ...plan.commands.map(
      ({ phase, command, args, port }) =>
        `  ${phase}${port ? ` (port ${port})` : ""}: ${[command, ...args].join(" ")}`,
    ),
    ...plan.cleanup.map(({ command, args }) => `  cleanup: ${[command, ...args].join(" ")}`),
    "",
  ].join("\n");
}
