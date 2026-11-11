# GradientPeak

Training software for web and mobile, with shared domain logic, APIs, and UI.

## Get started

```bash
mise trust
mise install
pnpm install
```

Follow [CONTRIBUTING.md](CONTRIBUTING.md) to configure your local environment and
start the web or mobile app. Use `pnpm dev:web:local` for web development without
a public tunnel. `pnpm dev` starts the full development graph, including provider
workers and the configured tunnel; it is not needed for every task.

## Repository map

- `apps/web` — TanStack Start web app.
- `apps/mobile` — Expo / React Native app.
- `packages/api` — API procedures, orchestration, and persistence boundaries.
- `packages/auth` — shared authentication contracts and runtime.
- `packages/core` — framework-independent domain logic and calculations.
- `packages/db` — schema, migrations, and database tooling.
- `packages/ui` — shared web/native UI primitives.
- `tooling` — shared configuration and focused development utilities.

Keep code with its owner. Share domain logic and primitives rather than copying
them between apps; prefer direct functions and existing tools over new wrappers.

## Working on a change

Run the owning package's tests or type check while iterating. CI owns full
validation; the pre-commit hook only checks staged files and pushes do not run
the entire suite. See [CONTRIBUTING.md](CONTRIBUTING.md) for verification choices.

## Documentation

- [Contributing](CONTRIBUTING.md): setup, commands, code organization, and checks.
- [Changelog](CHANGELOG.md): notable changes, not execution logs.
- [Security](SECURITY.md): vulnerability reporting.
- [Web](apps/web/README.md), [mobile](apps/mobile/README.md), and
  [database](packages/db/README.md): owner-specific instructions.
- [Local environments](docs/local-environments.md) and
  [development errors](docs/development-errors.md): operational troubleshooting.

Keep active contracts and runbooks in the repository. Use Git history for old
plans and audits; keep generated exports, screenshots, and execution logs outside
source control. Required generated contracts and migrations remain versioned.
