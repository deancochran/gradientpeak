import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ConfigContext } from "expo/config";
import { describe, expect, it } from "vitest";
import getAppConfig, { getDevelopmentTransportSecurity } from "../app.config";

describe("app config", () => {
  it("derives OTA compatibility from the native project fingerprint", () => {
    const config = getAppConfig({ config: {} } as ConfigContext);

    expect(config.runtimeVersion).toEqual({ policy: "fingerprint" });
  });

  it("omits arbitrary HTTP loads in production", () => {
    expect(getDevelopmentTransportSecurity("production")).toEqual({});
  });

  it("keeps only the localhost HTTP exception available outside production", () => {
    expect(getDevelopmentTransportSecurity("development")).toEqual({
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
        NSExceptionDomains: {
          localhost: {
            NSExceptionAllowsInsecureHTTPLoads: true,
          },
        },
      },
    });
  });

  it("declares no location permission, background mode, plugin, or dependency", async () => {
    const root = path.resolve(import.meta.dirname, "..");
    const [configSource, manifestSource] = await Promise.all([
      readFile(path.join(root, "app.config.ts"), "utf8"),
      readFile(path.join(root, "package.json"), "utf8"),
    ]);

    expect(configSource).not.toMatch(
      /NSLocation|ACCESS_(?:FINE|COARSE|BACKGROUND)_LOCATION|FOREGROUND_SERVICE_LOCATION|"location"|expo-location/,
    );
    expect(manifestSource).not.toMatch(/expo-(?:location|task-manager)/);
  });
});
