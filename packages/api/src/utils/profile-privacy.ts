export function redactProfileListFields<T extends Record<string, unknown>>(profile: T): T {
  return {
    ...profile,
    bio: null,
    dob: null,
    email: null,
    full_name: null,
    ftp: null,
    gender: null,
    language: null,
    preferred_units: null,
    threshold_hr: null,
    weight_kg: null,
  } as T;
}

export function redactPrivateProfileDetailFields<T extends Record<string, unknown>>(profile: T): T {
  return {
    ...profile,
    bio: null,
    gender: null,
    followers_count: null,
    following_count: null,
    preferred_units: null,
    language: null,
  } as T;
}
