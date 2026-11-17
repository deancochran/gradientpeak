# Wahoo web connection acceptance

Run this focused regression whenever changing provider OAuth return policy, the
web Connect action, or callback connection persistence. It is a required focused
check for those changes; the default disposable runner and generic CI smoke do
not select it.

From `apps/web`, with the repository Node/pnpm toolchain:

```bash
WAHOO_CLIENT_ID=disposable-wahoo-client \
WAHOO_CLIENT_SECRET=disposable-wahoo-secret \
WAHOO_OAUTH_TEST_SECRET=disposable-wahoo-test-only \
pnpm exec tsx scripts/run-disposable-acceptance.ts \
  e2e/specs/wahoo-web-connection.spec.ts \
  --project='Desktop Chrome' --project='Mobile Chrome 390x844'
```

The runner creates and cleans its own disposable database/storage, enables the
local OAuth adapter, and generates an ephemeral provider-token encryption key.
Do not copy credentials or encryption keys from a preserved environment.

The test clicks Wahoo Connect, follows the local provider callback back to the
web app, and verifies the persisted connection after a reload. External browser
requests are blocked. It does not prove real Wahoo consent, token exchange, sync,
or native-device behavior. API router regressions separately cover differing
app/provider-callback origins, development aliases, production exclusion, exact
mobile returns, and hostile return URLs.
