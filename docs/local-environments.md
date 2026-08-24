# Isolated local development environments

GradientPeak keeps the persistent manual lane and the on-demand E2E lane separate while both read the same live source tree.

## Manual lane

- Web/API: `http://100.119.109.24:3000`, bound by Vite to `0.0.0.0:3000`.
- Metro: `http://100.119.109.24:8081`, started by Expo in LAN mode.
- Supabase project: `gradientpeak` on ports `54321`–`54329`. Do not reset, recreate, or stop it as part of E2E work.
- Mobile environment: copy `apps/mobile/.env.example` to the existing untracked environment file and retain its Tailscale URLs.
- Manual Vite, Metro, and Expo state use the `manual` cache namespaces.

Start the normal lane with `pnpm dev`. Never use `pnpm dev:clean` while preserving this lane.

The host firewall must place `tailscale0` in a private zone that admits TCP 3000 and 8081 only. Do not admit Supabase, PostgreSQL, Studio, Mailpit, or E2E ports through that zone.

## E2E lane

- Supabase project: `gradientpeak_e2e`; API `127.0.0.1:55321`, database `127.0.0.1:55322`, reserved range `55320`–`55329`.
- Web/API: `http://127.0.0.1:3100`.
- Metro: `http://127.0.0.1:8082`.
- Android device: `emulator-5554` (`Pixel_8_API_35`).
- ADB reverse is limited to TCP 3100, 8082, and 55321.
- Playwright defaults to one worker and refuses stale-server reuse.
- Maestro uses one device, run-scoped artifacts, readiness probes, and package-scoped application state.
- E2E Vite, Metro, Expo, and artifact paths use E2E/run namespaces.

Database lifecycle:

```bash
pnpm db:e2e:start
pnpm db:e2e:migrate
pnpm db:e2e:status
pnpm db:e2e:stop
```

Each command validates the project ID, reserved ports, generated container namespace, ordered migration history, and repository schema-fingerprint identity before reporting success. The migration command bootstraps only a genuinely empty public schema and otherwise applies only ordered pending migrations. Ordinary stop/start preserves E2E data.

Run the bounded E2E development graph with `pnpm dev:e2e`. It caps Turborepo concurrency at four. Playwright and Maestro heavy phases are serialized by `pnpm test:e2e`. When the E2E lane is idle, `pnpm dev:e2e:stop` stops only ports 3100/8082 and the `gradientpeak_e2e` stack while preserving its database volume. It never invokes the broad manual cleanup command.

Use `MAESTRO_DRY_RUN=1 pnpm --filter mobile test:e2e` and the DB command `--dry-run` option to inspect non-secret routing summaries.
