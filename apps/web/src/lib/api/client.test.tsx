import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "@repo/api/client";
import { describe, expect, it } from "vitest";

import { createWebHeaders } from "./client";

describe("createWebHeaders", () => {
  it("sends the current contract epoch with the existing client headers", () => {
    const headers = createWebHeaders();

    expect(headers.get(CONTRACT_EPOCH_HEADER)).toBe(String(CURRENT_CONTRACT_EPOCH));
    expect(headers.get("x-api-source")).toBe("tanstack-start");
    expect(headers.get("x-client-type")).toBe("web");
  });
});
