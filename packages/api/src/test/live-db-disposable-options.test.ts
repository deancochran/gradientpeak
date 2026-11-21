import { describe, expect, it } from "vitest";
import {
  buildDisposableLiveDbVitestCommand,
  parseDisposableLiveDbCommand,
  requireDisposableLiveDbFlags,
  verifyDisposableLiveDbReceipt,
} from "../../scripts/live-db-disposable-options";

const target = "src/repositories/athlete-state-repository.live-db.test.ts";

describe("disposable live-DB command options", () => {
  it("builds the fixed package-owned Vitest command", () => {
    const command = parseDisposableLiveDbCommand(["--", target, "--disposable", "--local"]);
    expect(command).toEqual({ testFile: target });
    expect(buildDisposableLiveDbVitestCommand(command)).toEqual([
      "exec",
      "vitest",
      "run",
      target,
      "--config",
      "vitest.live-db.config.ts",
    ]);
  });

  it("only permits the two required runner flags", () => {
    expect(() => requireDisposableLiveDbFlags(["--disposable", "--local"])).not.toThrow();
    expect(() =>
      requireDisposableLiveDbFlags(["--disposable", "--local", "--unexpected"]),
    ).toThrow();
    expect(() => requireDisposableLiveDbFlags(["--", "--disposable", "--local"])).toThrow();
    expect(() => requireDisposableLiveDbFlags(["--disposable", "--local", "--"])).toThrow();
    expect(() => requireDisposableLiveDbFlags(["--", "--disposable", "--local", "--"])).toThrow();
  });

  it("accepts only one leading delimiter", () => {
    expect(() =>
      parseDisposableLiveDbCommand(["--", target, "--disposable", "--local"]),
    ).not.toThrow();
    expect(() => parseDisposableLiveDbCommand([target, "--", "--disposable", "--local"])).toThrow();
    expect(() =>
      parseDisposableLiveDbCommand(["--", "--", target, "--disposable", "--local"]),
    ).toThrow();
  });

  it("rejects invalid and foreign child receipts without opening a connection", () => {
    const expected = {
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/gradientpeak_api_live_db_1_2",
      postgresUrl: "postgresql://postgres:postgres@127.0.0.1:54322/gradientpeak_api_live_db_1_2",
    };
    expect(() => verifyDisposableLiveDbReceipt({ expected, actual: { databaseUrl: 1 } })).toThrow();
    expect(() =>
      verifyDisposableLiveDbReceipt({
        expected,
        actual: {
          databaseUrl: "postgresql://postgres:postgres@example.test/gradientpeak_api_live_db_1_2",
          postgresUrl: "postgresql://postgres:postgres@example.test/gradientpeak_api_live_db_1_2",
        },
      }),
    ).toThrow();
  });

  it.each([
    ["malformed URL", "not a URL"],
    ["HTTP URL", "http://postgres:postgres@127.0.0.1:54322/gradientpeak_api_live_db_1_2"],
    ["other protocol", "file:///gradientpeak_api_live_db_1_2"],
    ["non-disposable local database", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"],
    [
      "encoded slash",
      "postgresql://postgres:postgres@127.0.0.1:54322/gradientpeak_api_live_db_1%2F2",
    ],
    [
      "encoded backslash",
      "postgresql://postgres:postgres@127.0.0.1:54322/gradientpeak_api_live_db_1%5C2",
    ],
    [
      "encoded NUL",
      "postgresql://postgres:postgres@127.0.0.1:54322/gradientpeak_api_live_db_1%002",
    ],
  ])("rejects hostile receipt URL: %s", (_description, databaseUrl) => {
    expect(() =>
      verifyDisposableLiveDbReceipt({
        expected: { databaseUrl, postgresUrl: databaseUrl },
        actual: { databaseUrl, postgresUrl: databaseUrl },
      }),
    ).toThrow();
  });

  it("accepts only the exact IPv6 loopback host", () => {
    const ipv6Receipt = "postgresql://postgres:postgres@[::1]:54322/gradientpeak_api_live_db_1_2";
    expect(
      verifyDisposableLiveDbReceipt({
        expected: { databaseUrl: ipv6Receipt, postgresUrl: ipv6Receipt },
        actual: { databaseUrl: ipv6Receipt, postgresUrl: ipv6Receipt },
      }),
    ).toEqual({ databaseUrl: ipv6Receipt, postgresUrl: ipv6Receipt });

    const nonLoopbackReceipt =
      "postgresql://postgres:postgres@[::2]:54322/gradientpeak_api_live_db_1_2";
    expect(() =>
      verifyDisposableLiveDbReceipt({
        expected: { databaseUrl: nonLoopbackReceipt, postgresUrl: nonLoopbackReceipt },
        actual: { databaseUrl: nonLoopbackReceipt, postgresUrl: nonLoopbackReceipt },
      }),
    ).toThrow();
  });

  it("rejects valid local URLs that do not exactly match the generated target", () => {
    const expectedUrl =
      "postgresql://postgres:postgres@127.0.0.1:54322/gradientpeak_api_live_db_1_2";
    const otherTargetUrl =
      "postgresql://postgres:postgres@127.0.0.1:54322/gradientpeak_api_live_db_1_3";

    expect(() =>
      verifyDisposableLiveDbReceipt({
        expected: { databaseUrl: expectedUrl, postgresUrl: expectedUrl },
        actual: { databaseUrl: otherTargetUrl, postgresUrl: otherTargetUrl },
      }),
    ).toThrow();
    expect(() =>
      verifyDisposableLiveDbReceipt({
        expected: { databaseUrl: expectedUrl, postgresUrl: expectedUrl },
        actual: { databaseUrl: expectedUrl, postgresUrl: otherTargetUrl },
      }),
    ).toThrow();
    expect(() =>
      verifyDisposableLiveDbReceipt({
        expected: { databaseUrl: expectedUrl, postgresUrl: otherTargetUrl },
        actual: { databaseUrl: expectedUrl, postgresUrl: expectedUrl },
      }),
    ).toThrow();
  });

  it.each([
    [["--local", target]],
    [["--disposable", target]],
    [["--disposable", "--disposable", "--local", target]],
    [["--disposable", "--local", "/tmp/escape.live-db.test.ts"]],
    [["--disposable", "--local", "src/../escape.live-db.test.ts"]],
    [["--disposable", "--local", "src/repositories/not-live.test.ts"]],
    [["--disposable", "--local", target, "src/repositories/other.live-db.test.ts"]],
    [["--disposable", "--local", target, "--config", "other.config.ts"]],
    [["--disposable", "--local", target, "--config=other.config.ts"]],
    [["--disposable", "--local", target, "--testNamePattern=only-this"]],
    [["--disposable", "--local", target, "-t", "only-this"]],
    [[target, "--", "--disposable", "--local"]],
    [["--", "--", target, "--disposable", "--local"]],
  ])("rejects unsafe or alternate selection %j", (args) => {
    expect(() => parseDisposableLiveDbCommand(args)).toThrow();
  });
});
