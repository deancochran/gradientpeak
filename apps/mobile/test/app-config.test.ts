import { describe, expect, it } from "vitest";
import { getDevelopmentTransportSecurity } from "../app.config";

describe("app config transport security", () => {
  it("omits arbitrary HTTP loads in production", () => {
    expect(getDevelopmentTransportSecurity("production")).toEqual({});
  });

  it("keeps local HTTP exceptions available outside production", () => {
    expect(getDevelopmentTransportSecurity("development")).toMatchObject({
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
