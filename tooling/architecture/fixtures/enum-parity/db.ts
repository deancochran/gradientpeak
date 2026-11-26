export const genderEnum = pgEnum("gender", ["male", "female", "other"]);

declare function pgEnum(name: string, values: string[]): readonly string[];
