import { execFileSync } from "node:child_process";
import { dbPackageRoot } from "./_helpers";

/** Historical test source only; every caller must assert its pinned catalog fingerprint. */
export function authIdentityLegacyBaseline() {
  return execFileSync(
    "git",
    [
      "show",
      "0cefa21e9adc64aebf3eef03a2ba17f30be11b88:packages/db/supabase/migrations/20260730000000_mvp_baseline.sql",
    ],
    {
      cwd: dbPackageRoot,
      encoding: "utf8",
    },
  );
}
