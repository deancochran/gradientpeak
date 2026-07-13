export const genderSchema = defineEnum(["male", "female", "other", "prefer_not_to_say"]);

declare function defineEnum(values: string[]): readonly string[];
