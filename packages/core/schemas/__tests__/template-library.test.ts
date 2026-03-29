import { describe, expect, it } from "vitest";
import { templateApplyInputSchema, templateItemTypeSchema } from "../template_library";

describe("template library schemas", () => {
  it("accepts supported template item types", () => {
    expect(templateItemTypeSchema.parse("training_plan")).toBe("training_plan");
    expect(templateItemTypeSchema.parse("activity_plan")).toBe("activity_plan");
  });

  it("rejects unsupported template item types", () => {
    expect(templateItemTypeSchema.safeParse("mixed").success).toBe(false);
  });

  it("validates template apply input with optional dates", () => {
    const parsed = templateApplyInputSchema.safeParse({
      template_type: "training_plan",
      template_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      target_date: "2026-06-15",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects invalid template apply dates and ids", () => {
    const parsed = templateApplyInputSchema.safeParse({
      template_type: "activity_plan",
      template_id: "not-a-uuid",
      start_date: "03-01-2026",
    });

    expect(parsed.success).toBe(false);
  });
});
