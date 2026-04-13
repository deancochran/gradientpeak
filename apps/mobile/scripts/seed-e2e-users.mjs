import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { hash } from "bcryptjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const supabaseDir = path.resolve(scriptDir, "../../../packages/db/supabase");

const statusOutput = execFileSync("supabase", ["--workdir", supabaseDir, "status", "-o", "env"], {
  cwd: scriptDir,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

const env = Object.fromEntries(
  statusOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split("=");
      return [name, rest.join("=").replace(/^"|"$/g, "")];
    }),
);

const supabaseUrl = env.API_URL;
const serviceRoleKey = env.SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Local Supabase environment is unavailable. Start it with `pnpm self-host:up`.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  {
    email: "test@example.com",
    password: "password123",
    firstName: "Standard",
    lastName: "User",
    username: "standarduser",
    onboarded: true,
    isPublic: true,
  },
  {
    email: "onboarding@example.com",
    password: "password123",
    firstName: "Onboarding",
    lastName: "User",
    username: "onboardinguser",
    onboarded: false,
    isPublic: true,
  },
  {
    email: "coachcasey@example.com",
    password: "password123",
    firstName: "Coach",
    lastName: "Casey",
    username: "coachcasey",
    onboarded: true,
    isPublic: true,
  },
  {
    email: "sender@example.com",
    password: "password123",
    firstName: "Sender",
    lastName: "User",
    username: "senderuser",
    onboarded: true,
    isPublic: true,
  },
  {
    email: "receiver@example.com",
    password: "password123",
    firstName: "Receiver",
    lastName: "User",
    username: "receiveruser",
    onboarded: true,
    isPublic: true,
  },
  {
    email: "admin@test.com",
    password: "TestPass123!",
    firstName: "Admin",
    lastName: "User",
    username: "admintest",
    onboarded: true,
    isPublic: true,
  },
  {
    email: "coach@test.com",
    password: "TestPass123!",
    firstName: "Coach",
    lastName: "User",
    username: "coachtest",
    onboarded: true,
    isPublic: true,
  },
  {
    email: "athlete@test.com",
    password: "TestPass123!",
    firstName: "Athlete",
    lastName: "User",
    username: "athletetest",
    onboarded: true,
    isPublic: true,
  },
];

const STANDARD_ROUTE_ID = "8d0b4a27-d087-4eb2-8d9b-c0f3cb8fb001";
const STANDARD_EVENT_ID = "1f3f84f0-2d72-4d3f-8e0a-f8f93b13c001";
const STANDARD_ROUTE_POLYLINE = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

function shouldIgnoreProfileError(error) {
  return error?.code === "PGRST205";
}

async function ensureUser(user) {
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;

  const existing = listed.users.find((entry) => entry.email === user.email);

  let authUser = existing;
  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        first_name: user.firstName,
        last_name: user.lastName,
      },
    });

    if (error) throw error;
    authUser = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: {
        first_name: user.firstName,
        last_name: user.lastName,
      },
    });

    if (error) throw error;
    authUser = data.user;
  }

  const now = new Date().toISOString();
  const fullName = `${user.firstName} ${user.lastName}`;

  const { error: appUserError } = await supabase.from("users").upsert(
    {
      id: authUser.id,
      name: fullName,
      email: user.email,
      email_verified: true,
      image: null,
      created_at: now,
      updated_at: now,
    },
    {
      onConflict: "id",
    },
  );

  if (appUserError) throw appUserError;

  const { error: accountError } = await supabase.from("accounts").upsert(
    {
      id: `credential:${authUser.id}`,
      account_id: authUser.id,
      provider_id: "credential",
      user_id: authUser.id,
      password: await hash(user.password, 10),
      created_at: now,
      updated_at: now,
    },
    {
      onConflict: "id",
    },
  );

  if (accountError) throw accountError;

  const profilePayload = {
    id: authUser.id,
    created_at: now,
    updated_at: now,
    email: user.email,
    full_name: fullName,
    username: user.username,
    onboarded: user.onboarded,
    is_public: user.isPublic,
  };

  const { error: profileError } = await supabase.from("profiles").upsert(profilePayload, {
    onConflict: "id",
  });

  if (profileError && !shouldIgnoreProfileError(profileError)) {
    throw profileError;
  }

  if (shouldIgnoreProfileError(profileError)) {
    console.warn(`[e2e-seed] skipped profile upsert for ${user.email}: profiles not available yet`);
  }

  console.log(`[e2e-seed] ready ${user.email} (${user.username})`);

  return authUser;
}

async function ensureStandardUserFixtures(authUser) {
  const now = new Date();
  const nowIso = now.toISOString();
  const todayDate = nowIso.slice(0, 10);
  const startsAt = new Date(now);
  startsAt.setHours(9, 0, 0, 0);

  const { error: routeError } = await supabase.from("activity_routes").upsert(
    {
      id: STANDARD_ROUTE_ID,
      profile_id: authUser.id,
      name: "E2E River Loop",
      description: "Seeded route for signed-in smoke coverage.",
      activity_category: "run",
      file_path: `${authUser.id}/e2e-route.gpx`,
      total_distance: 10200,
      total_ascent: 180,
      total_descent: 175,
      source: "e2e-seed",
      elevation_polyline: null,
      polyline: STANDARD_ROUTE_POLYLINE,
      is_public: false,
      likes_count: 0,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      onConflict: "id",
    },
  );

  if (routeError) throw routeError;

  const { error: eventError } = await supabase.from("events").upsert(
    {
      id: STANDARD_EVENT_ID,
      profile_id: authUser.id,
      event_type: "custom",
      status: "scheduled",
      title: "E2E Calendar Workout",
      description: "Seeded calendar event for signed-in smoke coverage.",
      all_day: false,
      timezone: "UTC",
      occurrence_key: `e2e-${todayDate}`,
      starts_at: startsAt.toISOString(),
      ends_at: null,
      scheduled_date: todayDate,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      onConflict: "id",
    },
  );

  if (eventError) throw eventError;

  console.log(
    `[e2e-seed] ensured standard fixtures route=${STANDARD_ROUTE_ID} event=${STANDARD_EVENT_ID}`,
  );
}

for (const user of USERS) {
  const authUser = await ensureUser(user);

  if (user.email === "test@example.com") {
    await ensureStandardUserFixtures(authUser);
  }
}

console.log("[e2e-seed] local mobile/web test users ready");
