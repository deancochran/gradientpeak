// Exercise Expo Router's installed query-string dependency rather than a parser mock.
const queryString = require("query-string") as {
  parse(input: string): Record<string, string | string[] | null>;
  stringify(input: Record<string, string | string[] | null>): string;
};

describe("Expo Router query decoder security compatibility", () => {
  it("preserves Unicode, spaces, literal plus signs and repeated query keys", () => {
    expect(queryString.parse("name=caf%C3%A9&space=a+b&plus=%2B&tag=one&tag=two")).toEqual({
      name: "café",
      space: "a b",
      plus: "+",
      tag: ["one", "two"],
    });
  });

  it("decodes once and retains malformed bytes without throwing", () => {
    expect(
      queryString.parse("next=%2Fprofile%3Ftab%3Dactivity&literal=%2541%&bad=%E0%A4%A"),
    ).toEqual({ next: "/profile?tab=activity", literal: "%41%", bad: "%E0%A4%A" });
  });

  it("handles a long malformed encoded run without recursive reparsing", () => {
    const encoded = "%E0%A4%A".repeat(20_000);

    expect(queryString.parse(`value=${encoded}`).value).toBe(encoded);
  });

  it("retains the parser/stringifier contract for routing parameters", () => {
    const parameters = { activity: "ride/run", tag: ["one", "two"], empty: null };

    expect(queryString.parse(queryString.stringify(parameters))).toEqual(parameters);
  });
});
