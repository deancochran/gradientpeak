import { describe, expect, it } from "vitest";
import { getDevelopmentTransportSecurity } from "../app.config";

describe("app config transport security", () => {
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
});
