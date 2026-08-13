import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRunner,
  listenerPidsFromSs,
  parseArguments,
  stabilizeService,
  verifyListenerOwnership,
  waitForPort,
} from "./cli.mjs";
import { createProfilePlan, profileForPaths } from "./profiles.mjs";

function child({ exitCode = null } = {}) {
  const listeners = new Map();
  const listen = (event, callback) => {
    listeners.set(event, [...(listeners.get(event) ?? []), callback]);
    if (event === "exit" && exitCode !== null) queueMicrotask(() => callback(exitCode));
  };
  return {
    pid: Math.floor(Math.random() * 10_000) + 1,
    exitCode,
    killed: false,
    once: listen,
    on: listen,
    emit(event, value) {
      if (event === "exit") this.exitCode = value;
      for (const callback of listeners.get(event) ?? []) callback(value);
    },
  };
}

test("path selection is conservative", () => {
  assert.equal(profileForPaths([]), "static");
  assert.equal(profileForPaths(["docs/notes.md"]), "static");
  assert.equal(profileForPaths(["unknown/file"]), "full");
  assert.equal(profileForPaths(["pnpm-lock.yaml"]), "full");
});

test("web and full plans own their E2E hosts", () => {
  const web = createProfilePlan({ profile: "web" });
  assert.deepEqual(web.commands.slice(-2), [
    { command: "pnpm", args: ["dev:e2e:web"], phase: "start", port: 3000 },
    { command: "pnpm", args: ["test:e2e:web"], phase: "run" },
  ]);
  assert.deepEqual(
    createProfilePlan({ profile: "full" })
      .commands.filter(({ phase }) => phase === "start")
      .map(({ port }) => port),
    [3000, 8081],
  );
});

test("CLI accepts only the named profile option", () => {
  assert.deepEqual(parseArguments(["--profile", "web", "--plan"]), {
    changedPaths: [],
    plan: true,
    profile: "web",
  });
  assert.throws(() => parseArguments(["web"]), /Unknown argument/);
});

test("health and stabilization reject host exit or error", async () => {
  const exiting = child();
  const waiting = waitForPort(3000, {
    child: exiting,
    connect: async () => {
      throw new Error("closed");
    },
  });
  exiting.emit("exit", 1);
  await assert.rejects(waiting, /exited before health/);
  const failing = child();
  const stable = stabilizeService(failing, { timeout: 1_000 });
  failing.emit("error", new Error("bind failed"));
  await assert.rejects(stable, /failed during stabilization/);
});

test("Linux listener ownership accepts only the detached child group", async () => {
  const host = { pid: 42 };
  await verifyListenerOwnership(3000, host, {
    listeners: async () => [100],
    processGroup: async () => 42,
  });
  await assert.rejects(
    verifyListenerOwnership(3000, host, {
      listeners: async () => [100],
      processGroup: async () => 7,
    }),
    /not exclusively owned/,
  );
  assert.throws(() => listenerPidsFromSs("LISTEN 0 511 127.0.0.1:3000"), /Unable to identify/);
});

test("service startup failures clean up hosts", async () => {
  const events = [];
  const web = child();
  const mobile = child();
  const runner = createRunner({
    portAvailable: async (port) => port !== 8081,
    spawnProcess(_, args) {
      events.push(args);
      return args.includes("dev:e2e:web")
        ? web
        : args.includes("dev:e2e")
          ? mobile
          : child({ exitCode: 0 });
    },
    waitForHealth: async () => {},
    verifyOwnership: async () => {},
    stabilize: async () => {},
    killProcess(_, signal) {
      events.push([signal]);
      web.emit("exit", 0);
    },
    shutdownTimeout: 1,
  });
  await assert.rejects(
    runner.execute(createProfilePlan({ profile: "full" }), "/tmp"),
    AggregateError,
  );
  assert.equal(events.at(-1).at(-1), "test:e2e:clean");
  assert.equal(
    events.some((entry) => entry[0] === "SIGTERM"),
    true,
  );
});

test("multiple hosts stop in reverse order and keep CI isolation", async () => {
  const signals = [];
  const hosts = [child(), child()];
  let hostIndex = 0;
  const runner = createRunner({
    portAvailable: async () => true,
    spawnProcess(_, args, options) {
      assert.equal(options.env.CI, "true");
      return args.includes("web-host") || args.includes("mobile-host")
        ? hosts[hostIndex++]
        : child({ exitCode: 0 });
    },
    waitForHealth: async () => {},
    verifyOwnership: async () => {},
    stabilize: async () => {},
    killProcess(pid) {
      signals.push(pid);
      const host = hosts.find((entry) => -entry.pid === pid);
      host.emit("exit", 0);
    },
    shutdownTimeout: 1,
  });
  await runner.execute(
    {
      commands: [
        { command: "pnpm", args: ["web-host"], phase: "start", port: 3000 },
        { command: "pnpm", args: ["mobile-host"], phase: "start", port: 8081 },
      ],
      cleanup: [],
    },
    "/tmp",
  );
  assert.deepEqual(signals, [-hosts[1].pid, -hosts[0].pid]);
});

test("spawn error is aggregated and cleanup runs", async () => {
  const events = [];
  const host = child();
  const runner = createRunner({
    portAvailable: async () => true,
    spawnProcess(_, args) {
      events.push(args);
      if (args.includes("dev:e2e")) {
        queueMicrotask(() => host.emit("error", new Error("spawn")));
        return host;
      }
      return child({ exitCode: 0 });
    },
    waitForHealth: async () => {
      throw new Error("spawn");
    },
    verifyOwnership: async () => {},
    stabilize: async () => {},
    killProcess() {},
    shutdownTimeout: 1,
  });
  await assert.rejects(
    runner.execute(createProfilePlan({ profile: "mobile" }), "/tmp"),
    AggregateError,
  );
  assert.equal(events.at(-1).at(-1), "test:e2e:clean");
});

test("ownership loss after stabilization aborts before tests", async () => {
  const host = child();
  let checks = 0;
  const events = [];
  const runner = createRunner({
    portAvailable: async () => true,
    spawnProcess(_, args) {
      events.push(args);
      return args.includes("dev:e2e") ? host : child({ exitCode: 0 });
    },
    waitForHealth: async () => {},
    stabilize: async () => {},
    verifyOwnership: async () => {
      checks += 1;
      if (checks === 2) throw new Error("listener stolen");
    },
    killProcess(_, signal) {
      if (signal === "SIGTERM") host.emit("exit", 0);
    },
    shutdownTimeout: 1,
  });
  await assert.rejects(
    runner.execute(createProfilePlan({ profile: "mobile" }), "/tmp"),
    AggregateError,
  );
  assert.equal(
    events.some((args) => args.at(-1) === "test:e2e"),
    false,
  );
});
