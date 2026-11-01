import {
  assertFreshContainerIdentity,
  type DockerContainerInspection,
  readFreshAcceptanceTarget,
} from "@repo/db/acceptance-target";
import { describe, expect, it } from "vitest";

const targetId = "0123456789abcdef";
const databaseName = `gradientpeak_fresh_${targetId}`;
const databaseUrl = `postgresql://postgres:fixture@127.0.0.1:65432/${databaseName}`;

function fixtureEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: databaseUrl,
    DB_DISPOSABLE_DATABASE: databaseName,
    DB_DISPOSABLE_TARGET: "1",
    DB_DISPOSABLE_TARGET_ID: targetId,
    POSTGRES_URL: databaseUrl,
    ...overrides,
  };
}

function fixtureInspection(overrides: DockerContainerInspection = {}): DockerContainerInspection {
  return {
    Config: {
      Labels: {
        "com.gradientpeak.disposable": "true",
        "com.gradientpeak.target-id": targetId,
      },
    },
    NetworkSettings: {
      Ports: {
        "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "65432" }],
      },
    },
    ...overrides,
  };
}

describe("fresh acceptance target guard", () => {
  it("requires the generated disposable loopback database contract", () => {
    expect(readFreshAcceptanceTarget(fixtureEnvironment())).toMatchObject({
      databaseName,
      databasePort: "65432",
      databaseUrl,
      targetId,
    });
  });

  it("rejects a container with tampered disposable labels", () => {
    const target = readFreshAcceptanceTarget(fixtureEnvironment());
    expect(() =>
      assertFreshContainerIdentity(
        target,
        fixtureInspection({
          Config: { Labels: { "com.gradientpeak.disposable": "true" } },
        }),
      ),
    ).toThrow("required disposable labels");
  });

  it("rejects preserved ports, remote hosts, and connection-parameter redirects", () => {
    for (const url of [
      databaseUrl.replace(":65432/", ":54322/"),
      databaseUrl.replace("127.0.0.1", "example.com"),
      `${databaseUrl}?host=example.com`,
    ]) {
      expect(() =>
        readFreshAcceptanceTarget(fixtureEnvironment({ DATABASE_URL: url, POSTGRES_URL: url })),
      ).toThrow();
    }
    expect(() =>
      readFreshAcceptanceTarget(fixtureEnvironment({ DB_DISPOSABLE_TARGET: undefined })),
    ).toThrow();
  });

  it("rejects a URL port that is not the container's loopback mapping", () => {
    const target = readFreshAcceptanceTarget(fixtureEnvironment());
    expect(() =>
      assertFreshContainerIdentity(
        target,
        fixtureInspection({
          NetworkSettings: {
            Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "54321" }] },
          },
        }),
      ),
    ).toThrow("does not match the disposable container's 127.0.0.1:5432 host mapping");
  });
});
