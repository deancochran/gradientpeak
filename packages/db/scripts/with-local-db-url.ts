#!/usr/bin/env tsx

import { prepareDbEnv, runPnpmExec } from "./_helpers";

prepareDbEnv();
runPnpmExec(process.argv.slice(2));
