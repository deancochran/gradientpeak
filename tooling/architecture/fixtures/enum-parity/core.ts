const genderValues = ["male", "female", "other", "prefer_not_to_say"] as const;

export const genderSchema = defineEnum(genderValues);

declare function defineEnum(values: string[]): readonly string[];
