#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SUPABASE_DIR="$ROOT_DIR/packages/db/supabase"

extract_env_value() {
  local source_text="$1"
  local target_name="$2"

  python - "$source_text" "$target_name" <<'PY'
import sys

source_text = sys.argv[1]
target_name = sys.argv[2]

for raw in source_text.splitlines():
    if raw.startswith(f"{target_name}="):
        print(raw.split("=", 1)[1].strip().strip('"'))
        break
PY
}

SUPABASE_ENV="$(pnpm dlx supabase --workdir "$SUPABASE_DIR" status -o env)"
PUBLISHABLE_KEY="$(extract_env_value "$SUPABASE_ENV" PUBLISHABLE_KEY)"
SERVICE_ROLE_KEY="$(extract_env_value "$SUPABASE_ENV" SERVICE_ROLE_KEY)"

cat <<EOF
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
APP_URL=http://127.0.0.1:3000
OAUTH_CALLBACK_BASE_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PRIVATE_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY}
NEXT_PRIVATE_SUPABASE_SECRET_KEY=${SERVICE_ROLE_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
EXPO_PUBLIC_API_URL=http://127.0.0.1:3000
EXPO_PUBLIC_APP_URL=http://127.0.0.1:3000
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY}
EXPO_PACKAGER_PROXY_URL=http://localhost:8081
EXPO_DEV_SERVER_URL=http://localhost:8081
EXPO_DEV_SERVER_LABEL=http://localhost:8081
REACT_NATIVE_PACKAGER_HOSTNAME=127.0.0.1
EXPO_PUBLIC_REDIRECT_URI=gradientpeak://integrations
STANDARD_USER_EMAIL=test@example.com
STANDARD_USER_PASS=password123
ONBOARDING_USER_EMAIL=onboarding@example.com
ONBOARDING_USER_PASS=password123
TARGET_USERNAME=coachcasey
NEXT_PUBLIC_MOBILE_AUTH_REDIRECT_URI=gradientpeak://sign-in
NEXT_PUBLIC_MOBILE_REDIRECT_URI=gradientpeak://integrations
NEXT_PUBLIC_MOBILE_REDIRECT_FALLBACK=gradientpeak://integrations
AUTH_ALLOWED_DEEP_LINK_PREFIXES=gradientpeak://,exp+gradientpeak://
STRAVA_CLIENT_ID=test-strava-client
STRAVA_CLIENT_SECRET=test-strava-secret
WAHOO_CLIENT_ID=test-wahoo-client
WAHOO_CLIENT_SECRET=test-wahoo-secret
WAHOO_WEBHOOK_TOKEN=test-wahoo-webhook-token
TRAININGPEAKS_CLIENT_ID=test-trainingpeaks-client
TRAININGPEAKS_CLIENT_SECRET=test-trainingpeaks-secret
GARMIN_CLIENT_ID=test-garmin-client
GARMIN_CLIENT_SECRET=test-garmin-secret
ZWIFT_CLIENT_ID=test-zwift-client
ZWIFT_CLIENT_SECRET=test-zwift-secret
EOF
