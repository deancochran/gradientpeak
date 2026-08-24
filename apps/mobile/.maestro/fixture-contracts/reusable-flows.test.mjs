import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import test from "node:test";
import { parseAllDocuments } from "yaml";
import { compileManifest, maestroRoot, validateStatic } from "./lib.mjs";

const flowsRoot = resolve(maestroRoot, "flows");
const domainRoot = resolve(flowsRoot, "reusable/domain");

function collectYaml(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? collectYaml(path) : /\.ya?ml$/.test(entry.name) ? [path] : [];
  });
}

function parse(path) {
  const text = readFileSync(path, "utf8");
  const documents = parseAllDocuments(text);
  const errors = documents.flatMap((document) => document.errors);
  assert.deepEqual(errors, [], `${relative(maestroRoot, path)}\n${errors.join("\n")}`);
  return { text, values: documents.map((document) => document.toJS()) };
}

function declarations(text) {
  return [...text.matchAll(/^# @arg ([A-Z][A-Z0-9_]*) (\S+) required$/gm)].map(
    ([, name, type]) => ({ name, type }),
  );
}

function runFlowCalls(value, calls = []) {
  if (Array.isArray(value)) {
    for (const item of value) runFlowCalls(item, calls);
    return calls;
  }
  if (!value || typeof value !== "object") return calls;
  if (Object.hasOwn(value, "runFlow")) {
    const runFlow = value.runFlow;
    if (typeof runFlow === "string") calls.push({ file: runFlow, env: {} });
    else if (runFlow?.file) calls.push({ file: runFlow.file, env: runFlow.env ?? {} });
  }
  for (const nested of Object.values(value)) runFlowCalls(nested, calls);
  return calls;
}

const allYamlPaths = collectYaml(maestroRoot);
const allFlowPaths = collectYaml(flowsRoot);
const parsedFlows = new Map(allFlowPaths.map((path) => [path, parse(path)]));

test("all Maestro YAML is syntactically valid", () => {
  for (const path of allYamlPaths) parse(path);
  assert.ok(parsedFlows.size > 194);
});

test("atomic domain subflows declare typed arguments and readiness without owning lifecycle", () => {
  const allowedTypes =
    /^(email|secret|uuid|date|text|selector-id|filename|identifier|enum\([^)]+\))$/;
  for (const path of collectYaml(domainRoot)) {
    const { text } = parsedFlows.get(path);
    const label = relative(maestroRoot, path);
    assert.match(text, /^# @purpose .+$/m, `${label}: missing purpose`);
    assert.match(text, /^# @ready .+$/m, `${label}: missing readiness contract`);
    assert.doesNotMatch(
      text,
      /(?:^|\s)(?:launchApp|stopApp|clearState|clearKeychain):?/m,
      `${label}: lifecycle belongs to the top-level runner`,
    );
    assert.doesNotMatch(
      text,
      /optional:\s*true/,
      `${label}: required domain work cannot be optional`,
    );
    const declared = declarations(text);
    const declaredNames = new Set(declared.map(({ name }) => name));
    for (const { name, type } of declared) {
      assert.match(type, allowedTypes, `${label}: ${name} has unknown type ${type}`);
    }
    const used = new Set(
      [...text.matchAll(/\$\{([A-Z][A-Z0-9_]*)\b/g)]
        .map((match) => match[1])
        .filter((name) => !["MAESTRO_APP_ID", "MAESTRO_APP_SCHEME"].includes(name)),
    );
    assert.deepEqual([...used].sort(), [...declaredNames].sort(), `${label}: argument drift`);
  }
});

test("every nested-flow reference resolves and required runFlow.env arguments are supplied", () => {
  for (const [caller, parsed] of parsedFlows) {
    for (const call of runFlowCalls(parsed.values)) {
      const target = resolve(dirname(caller), call.file);
      assert.equal(
        existsSync(target),
        true,
        `${relative(maestroRoot, caller)} -> ${call.file} does not resolve`,
      );
      if (!target.startsWith(`${domainRoot}/`)) continue;
      const targetText = parsedFlows.get(target)?.text ?? readFileSync(target, "utf8");
      for (const declaration of declarations(targetText)) {
        assert.equal(
          Object.hasOwn(call.env, declaration.name),
          true,
          `${relative(maestroRoot, caller)} -> ${relative(maestroRoot, target)} misses ${declaration.name}`,
        );
        const value = call.env[declaration.name];
        assert.notEqual(String(value ?? "").trim(), "", `${declaration.name} must not be blank`);
        const choices = declaration.type.match(/^enum\(([^)]+)\)$/)?.[1].split("|");
        if (choices && !String(value).includes("${")) {
          assert.ok(
            choices.includes(String(value)),
            `${declaration.name} must be ${choices.join("|")}`,
          );
        }
      }
    }
  }
});

test("nested flows have no recursive cycles", () => {
  const graph = new Map(
    [...parsedFlows].map(([caller, parsed]) => [
      caller,
      runFlowCalls(parsed.values).map((call) => resolve(dirname(caller), call.file)),
    ]),
  );
  const visiting = new Set();
  const visited = new Set();
  function visit(path, chain = []) {
    if (visiting.has(path)) {
      assert.fail(
        `nested-flow cycle: ${[...chain, path].map((item) => relative(maestroRoot, item)).join(" -> ")}`,
      );
    }
    if (visited.has(path)) return;
    visiting.add(path);
    for (const target of graph.get(path) ?? []) visit(target, [...chain, path]);
    visiting.delete(path);
    visited.add(path);
  }
  for (const path of graph.keys()) visit(path);
});

test("only the preserved lifecycle helpers may launch or reset the app", () => {
  const lifecycleOwners = [...parsedFlows]
    .filter(([, { text }]) =>
      /(?:^|\s)(?:launchApp|stopApp|clearState|clearKeychain):?/m.test(text),
    )
    .map(([path]) => relative(maestroRoot, path))
    .sort();
  assert.deepEqual(lifecycleOwners, [
    "flows/reusable/clean_app_launch_signed_out.yaml",
    "flows/reusable/preserve_state_relaunch.yaml",
    "flows/reusable/refuse_destructive_reset_while_recording.yaml",
  ]);
});

test("primary identities remain exactly 97 independent A/B pairs with unique JUnit IDs", () => {
  const manifest = compileManifest();
  const validation = validateStatic(manifest);
  assert.equal(validation.ok, true, validation.errors.join("\n"));
  assert.equal(manifest.primary.length, 194);
  assert.equal(new Set(manifest.primary.map(({ sourceIdentity }) => sourceIdentity)).size, 97);
  assert.equal(new Set(manifest.primary.map(({ id }) => id)).size, 194);
  for (const sourceIdentity of new Set(manifest.primary.map((entry) => entry.sourceIdentity))) {
    assert.deepEqual(
      manifest.primary
        .filter((entry) => entry.sourceIdentity === sourceIdentity)
        .map((entry) => entry.variation)
        .sort(),
      ["a", "b"],
      sourceIdentity,
    );
  }
});
