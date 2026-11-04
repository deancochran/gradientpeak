type Category = "run" | "bike" | "swim" | "strength" | "other";
export function discoveryActivityInput(search: string, category: string, sort: string) {
  return {
    ownerScope: "discoverable" as const,
    search: search.trim() || undefined,
    activityCategories: category ? [category as Category] : undefined,
    sort_by: sort as "newest" | "oldest",
    limit: 20,
  };
}
export function discoveryTrainingInput(
  search: string,
  category: string,
  experience: string,
  sort: string,
) {
  return {
    search: search.trim() || undefined,
    activity_category: category ? (category as Category) : undefined,
    experience_level: experience
      ? (experience as "beginner" | "intermediate" | "advanced")
      : undefined,
    sort_by: sort as
      | "newest"
      | "oldest"
      | "duration_desc"
      | "duration_asc"
      | "sessions_desc"
      | "sessions_asc",
    limit: 20,
  };
}
export function discoveryRoutesInput(search: string, min: string, max: string, sort: string) {
  return {
    ownerScope: "all" as const,
    search: search.trim() || undefined,
    min_distance_m: min ? Number(min) * 1000 : undefined,
    max_distance_m: max ? Number(max) * 1000 : undefined,
    sort_by: sort as "newest" | "oldest" | "distance_desc" | "distance_asc",
    limit: 20,
  };
}
export function discoveryUsersInput(search: string, sort: string) {
  return {
    query: search.trim() || undefined,
    sort_by: sort as "newest" | "oldest" | "username_asc" | "username_desc",
    limit: 20,
  };
}
export function discoveryGroupsInput(search: string, sort: string) {
  return {
    search: search.trim() || undefined,
    sort_by: sort === "oldest" ? ("oldest" as const) : ("newest" as const),
    limit: 20,
  };
}
