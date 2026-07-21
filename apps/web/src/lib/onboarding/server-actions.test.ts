import { describe, expect, it } from "vitest";

import { parseOnboardingFormData } from "./form-data";

describe("parseOnboardingFormData", () => {
  it("builds the persisted lifecycle payload with baseline provenance, preferences, goal, and social choices", () => {
    const form = new FormData();
    form.set("full_name", "  Web Athlete  ");
    form.set("username", "web_athlete");
    form.set("experience_level", "advanced");
    form.append("intents", "train_event");
    form.append("intents", "groups");
    form.set("dob", "1990-04-12");
    form.set("dob_source", "imported");
    form.set("weight_kg", "72.5");
    form.set("weight_kg_source", "manual");
    form.set("max_hr", "188");
    form.set("max_hr_source", "estimated");
    form.set("save_preferences", "on");
    form.set("preference_preset", "balanced");
    form.set("min_sessions_per_week", "3");
    form.set("max_sessions_per_week", "5");
    form.set("goal_title", "Finish spring sportive");
    form.set("goal_target_date", "2027-05-01");
    form.set("goal_activity_category", "bike");
    form.set("goal_target_sessions_per_week", "4");
    form.set("goal_target_weeks", "12");
    form.append("invitation_ids", "00000000-0000-4000-8000-000000000001");
    form.append("group_ids", "00000000-0000-4000-8000-000000000002");
    form.append("follow_profile_ids", "00000000-0000-4000-8000-000000000003");

    expect(parseOnboardingFormData(form)).toEqual({
      profile: {
        baseline_field_sources: {
          dob: "imported",
          max_hr: "estimated",
          weight_kg: "manual",
        },
        dob: "1990-04-12",
        experience_level: "advanced",
        full_name: "Web Athlete",
        intents: ["train_event", "groups"],
        max_hr: 188,
        username: "web_athlete",
        weight_kg: 72.5,
      },
      settings_patch: {
        maxSessionsPerWeek: 5,
        minSessionsPerWeek: 3,
        preset: "balanced",
      },
      goal: {
        activity_category: "bike",
        priority: 5,
        target_date: "2027-05-01",
        target_payload: {
          target_sessions_per_week: 4,
          target_weeks: 12,
          type: "consistency",
        },
        title: "Finish spring sportive",
      },
      social: {
        followProfileIds: ["00000000-0000-4000-8000-000000000003"],
        groupIds: ["00000000-0000-4000-8000-000000000002"],
        invitationIds: ["00000000-0000-4000-8000-000000000001"],
      },
      redirect: "/",
    });
  });

  it("rejects invalid metric ranges and incomplete goals", () => {
    const form = new FormData();
    form.set("full_name", "Web Athlete");
    form.set("username", "web_athlete");
    form.set("experience_level", "advanced");
    form.set("ftp", "701");
    form.set("goal_title", "Incomplete goal");

    expect(() => parseOnboardingFormData(form)).toThrow();
  });

  it("does not attach provenance to omitted baseline values", () => {
    const form = new FormData();
    form.set("full_name", "Web Athlete");
    form.set("username", "web_athlete");
    form.set("experience_level", "skip");
    form.set("ftp_source", "imported");

    expect(parseOnboardingFormData(form).profile).toEqual({
      experience_level: "skip",
      full_name: "Web Athlete",
      intents: [],
      username: "web_athlete",
    });
  });
});
