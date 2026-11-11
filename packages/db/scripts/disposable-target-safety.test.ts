import { defaultLocalDatabaseUrl } from "./_local-database-config";
import {
  requireExplicitLocalTarget,
  requireGuardedDisposableLocalDatabaseUrl,
  requireRepositoryManagedDisposableLocalTarget,
} from "./_target-safety";

const bad = [
  "postgresql://postgres:postgres@localhost:54322/postgres",
  "postgresql://postgres:postgres@example.test/postgres",
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres%2Fshared",
  "not-a-url",
];
for (const target of bad) {
  try {
    requireExplicitLocalTarget(["--local", `--database-url=${target}`]);
    throw new Error("unsafe target passed the pre-connect guard");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("refusing")) throw error;
  }
}
for (const target of bad) {
  try {
    requireGuardedDisposableLocalDatabaseUrl(target);
    throw new Error("unsafe disposable target passed the pre-connect guard");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("refusing")) throw error;
  }
}

const expectRefusal = (run: () => unknown) => {
  try {
    run();
    throw new Error("unsafe disposable target passed the repository ownership guard");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("refusing")) throw error;
  }
};

expectRefusal(() =>
  requireRepositoryManagedDisposableLocalTarget(
    ["--disposable", "--local", `--database-url=${defaultLocalDatabaseUrl}`],
    () => true,
  ),
);
expectRefusal(() =>
  requireRepositoryManagedDisposableLocalTarget(["--disposable", "--local"], () => false),
);

const managedTarget = requireRepositoryManagedDisposableLocalTarget(
  ["--disposable", "--local"],
  ({ containerName, port }) => containerName === "supabase_db_gradientpeak" && port === "54322",
);
if (managedTarget !== defaultLocalDatabaseUrl) {
  throw new Error("repository-managed disposable target did not resolve to the pinned local URL");
}
console.log(
  "[db:disposable-target:safety:test] unsafe targets rejected before connection construction",
);

await import("./disposable-target-lifecycle.test");
