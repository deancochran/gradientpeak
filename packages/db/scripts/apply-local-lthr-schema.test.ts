import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvidenceUniqueReplacementStatements,
  buildLthrSchemaPlan,
  createActivityCountSnapshot,
  KNOWN_LOCAL_THRESHOLD_CONSTRAINTS,
  parseLthrLocalMode,
  requireActivityCountsUnchanged,
  requireEvidenceUniqueState,
  requireKnownLocalThresholdConstraints,
  requireLocalAuthority,
  requireLocalContainerIdentity,
} from "./apply-local-lthr-schema";

const config = `project_id = "gradientpeak"
[db]
port = 54322
`;

test("writes require --local --apply while dry-run is the default", () => {
  assert.deepEqual(parseLthrLocalMode([]), { apply: false });
  assert.deepEqual(parseLthrLocalMode(["--dry-run"]), { apply: false });
  assert.deepEqual(parseLthrLocalMode(["--local", "--apply"]), { apply: true });
  assert.throws(() => parseLthrLocalMode(["--apply"]), /--local --apply/);
  assert.throws(() => parseLthrLocalMode(["--local", "--apply", "--dry-run"]), /cannot combine/);
});

test("target guard requires the repository local endpoint and container identity", () => {
  assert.equal(
    requireLocalAuthority(config, "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
      .projectId,
    "gradientpeak",
  );
  assert.equal(
    requireLocalAuthority(config, "postgresql://postgres:postgres@localhost:54322/postgres").port,
    "54322",
  );
  const unsafeAuthorities: Array<readonly [string, string]> = [
    [
      config.replace("gradientpeak", "other"),
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    ],
    [config, "postgresql://postgres:postgres@127.0.0.1:54323/postgres"],
    [config, "postgresql://postgres:postgres@example.test:54322/postgres"],
    [config, "postgresql://postgres:postgres@127.0.0.1:54322/other"],
  ];
  for (const [unsafeConfig, unsafeUrl] of unsafeAuthorities) {
    assert.throws(() => requireLocalAuthority(unsafeConfig, unsafeUrl), /Refused database target/);
  }
  const valid = {
    Config: {
      Labels: {
        "com.docker.compose.project": "gradientpeak",
        "com.supabase.cli.project": "gradientpeak",
      },
    },
    Name: "/supabase_db_gradientpeak",
    NetworkSettings: { Ports: { "5432/tcp": [{ HostPort: "54322" }] } },
    State: { Running: true },
  };
  assert.doesNotThrow(() => requireLocalContainerIdentity(valid));
  assert.throws(
    () => requireLocalContainerIdentity({ ...valid, State: { Running: false } }),
    /identity did not match/,
  );
});

test("only the exact known power and speed constraints can be removed", () => {
  const effortConstraint = KNOWN_LOCAL_THRESHOLD_CONSTRAINTS[0];
  const evaluationConstraint = KNOWN_LOCAL_THRESHOLD_CONSTRAINTS[1];
  assert.ok(effortConstraint);
  assert.ok(evaluationConstraint);
  assert.equal(
    requireKnownLocalThresholdConstraints([...KNOWN_LOCAL_THRESHOLD_CONSTRAINTS]).length,
    4,
  );
  assert.equal(requireKnownLocalThresholdConstraints([]).length, 0);
  assert.throws(
    () =>
      requireKnownLocalThresholdConstraints([{ ...effortConstraint, definition: "CHECK (true)" }]),
    /unknown threshold constraint variant/,
  );
  assert.throws(
    () => requireKnownLocalThresholdConstraints([{ ...evaluationConstraint, table: "thresholds" }]),
    /unknown threshold constraint variant/,
  );
});

test("threshold evidence uniqueness attests constraints and standalone indexes exactly", () => {
  for (const owner of ["constraint", "index"] as const) {
    assert.equal(
      requireEvidenceUniqueState([
        { owner, definition: "UNIQUE (profile_id, activity_category, activity_id)" },
      ]),
      "legacy",
    );
    assert.equal(
      requireEvidenceUniqueState([
        { owner, definition: "UNIQUE (profile_id, activity_category, metric, activity_id)" },
      ]),
      "current",
    );
  }
  assert.equal(requireEvidenceUniqueState([]), "missing");
  assert.throws(
    () =>
      requireEvidenceUniqueState([
        { owner: "constraint", definition: "UNIQUE (profile_id, activity_category, activity_id)" },
        { owner: "index", definition: "UNIQUE (profile_id, activity_category, activity_id)" },
      ]),
    /was not unique/,
  );
  assert.throws(
    () =>
      requireEvidenceUniqueState([
        { owner: "index", definition: "UNIQUE (profile_id, activity_category, source_series)" },
      ]),
    /unknown threshold evidence uniqueness variant/,
  );
});

test("legacy replacement drops the owned representation before adding the current constraint", () => {
  const expectedAdd =
    'alter table public.threshold_evidence add constraint "threshold_evidence_profile_category_activity_unique" unique (profile_id, activity_category, metric, activity_id)';
  for (const owner of ["constraint", "index"] as const) {
    const statements = buildEvidenceUniqueReplacementStatements(owner);
    assert.equal(statements.length, 2);
    assert.match(statements[0] ?? "", owner === "constraint" ? /drop constraint/ : /drop index/);
    assert.equal(statements[1], expectedAdd);
  }
  assert.deepEqual(buildEvidenceUniqueReplacementStatements(undefined), [expectedAdd]);
});

test("plan is idempotent after LTHR schema support is present", () => {
  assert.deepEqual(
    buildLthrSchemaPlan({ driftConstraints: [], enumHasLthr: true, evidenceUnique: "current" }),
    { addEnumValue: false, dropDriftConstraints: [], replaceEvidenceUnique: false },
  );
  assert.deepEqual(
    buildLthrSchemaPlan({
      driftConstraints: [...KNOWN_LOCAL_THRESHOLD_CONSTRAINTS],
      enumHasLthr: false,
      evidenceUnique: requireEvidenceUniqueState([
        "UNIQUE (profile_id, activity_category, activity_id)",
      ]),
    }),
    {
      addEnumValue: true,
      dropDriftConstraints: [...KNOWN_LOCAL_THRESHOLD_CONSTRAINTS],
      replaceEvidenceUnique: true,
    },
  );
  assert.throws(
    () =>
      requireEvidenceUniqueState([
        "UNIQUE (profile_id, activity_category, activity_id, source_series_metric)",
      ]),
    /unknown threshold evidence uniqueness variant/,
  );
});

test("activity count invariant compares the total and every profile", () => {
  const before = createActivityCountSnapshot("3", [
    { activity_count: "1", profile_id: "profile-b" },
    { activity_count: "2", profile_id: "profile-a" },
  ]);
  assert.doesNotThrow(() =>
    requireActivityCountsUnchanged(
      before,
      createActivityCountSnapshot("3", [
        { activity_count: "2", profile_id: "profile-a" },
        { activity_count: "1", profile_id: "profile-b" },
      ]),
    ),
  );
  assert.throws(
    () =>
      requireActivityCountsUnchanged(
        before,
        createActivityCountSnapshot("4", [{ activity_count: "4", profile_id: "profile-a" }]),
      ),
    /changed total or per-profile activity counts/,
  );
});
