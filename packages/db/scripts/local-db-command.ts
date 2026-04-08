#!/usr/bin/env tsx

import { prepareDbEnv, runSupabaseCli } from "./_helpers";

prepareDbEnv();
runSupabaseCli(process.argv.slice(2));
