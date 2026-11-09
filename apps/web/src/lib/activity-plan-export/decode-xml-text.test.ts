import { describe, expect, it } from "vitest";
import { decodeXmlText } from "./decode-xml-text";

describe("decodeXmlText", () => {
  it.each([
    ["&amp;lt;", "&lt;"],
    ["&#38;lt;", "&lt;"],
    ["&#x26;#65;", "&#65;"],
    ["&amp;#x41;", "&#x41;"],
    ["&lt;&gt;&quot;&apos;&amp;", "<>\"'&"],
    ["&#65;&#x41;&#X1F600;", "AA😀"],
    ["A &amp; B &lt; C &#x26;", "A & B < C &"],
    ["&unknown; &AMP; &amp", "&unknown; &AMP; &amp"],
  ])("decodes exactly one layer of %s", (input, expected) => {
    expect(decodeXmlText(input)).toBe(expected);
  });

  it("retains rejection of out-of-range numeric entities", () => {
    expect(() => decodeXmlText("&#x110000;")).toThrow(RangeError);
  });
});
