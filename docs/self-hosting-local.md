# Self-Hosting

GradientPeak now publishes a container image to GitHub Container Registry (GHCR)
whenever `main` is updated.

Container build definition lives at `apps/web/Dockerfile`.

## Container image

- Registry: `ghcr.io/<owner>/<repo>`
- Tags:
  - `latest` (latest successful `main` build)
  - `sha-<commit>` (immutable commit image)

## Run the image

1. Copy the example env file and fill in values:

```bash
cp apps/web/selfhost.env.example apps/web/.env.selfhost
```

2. Run the image:

```bash
docker run -d --name gradientpeak-web -p 3000:3000 \
  --env-file apps/web/.env.selfhost \
  --restart unless-stopped \
  ghcr.io/<owner>/<repo>:latest
```

Check health:

```bash
curl http://127.0.0.1:3000/api/health
```

Pin a deterministic release instead of `latest` when you want stable upgrades:

```bash
docker pull ghcr.io/<owner>/<repo>:sha-<commit>
```

## Mobile app sign-in against your host

1. Open mobile sign-in/sign-up.
2. Expand `Server URL`.
3. Enter your hosted API base URL (for local example: `http://<LAN-IP>:3000`).
4. Sign in normally.

The app persists that override and routes auth/data calls to your host.

## Optional local Supabase bootstrap

If you want to run Supabase locally from this repo:

1. Create local Supabase env file:

```bash
cp packages/supabase/.env.example packages/supabase/.env
```

2. Start/stop stack:

```bash
pnpm self-host:up
pnpm self-host:down
```
