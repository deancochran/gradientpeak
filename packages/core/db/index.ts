// packages/core/db/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

export const dbClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
