import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const supabaseDir = path.resolve(scriptDir, "../../../packages/supabase");

const statusOutput = execFileSync("supabase", ["status", "-o", "env"], {
  cwd: supabaseDir,
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
];

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

  const profilePayload = {
    id: authUser.id,
    username: user.username,
    onboarded: user.onboarded,
    is_public: user.isPublic,
  };

  const { error: profileError } = await supabase.from("profiles").upsert(profilePayload, {
    onConflict: "id",
  });

  if (profileError) throw profileError;

  console.log(`[e2e-seed] ready ${user.email} (${user.username})`);
}

for (const user of USERS) {
  await ensureUser(user);
}

console.log("[e2e-seed] local mobile/web test users ready");
