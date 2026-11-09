import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const mobileRequire = createRequire(resolve(process.cwd(), "apps/mobile/package.json"));
const routerRequire = createRequire(mobileRequire.resolve("expo-router/package.json"));
const queryString = routerRequire("query-string");
const validCallback = ["code=a", "%2B", "b&state=hello", "%20", "world"].join("");
const unicodeValue = ["city=Z", "%C3", "%BC", "rich"].join("");
const malformedValue = ["malformed=", "%E0", "%A4", "%A"].join("");

test("Expo Router's CommonJS query-string uses the patched ESM decoder", () => {
  assert.deepEqual(Object.entries(queryString.parse(validCallback)), [
    ["code", "a+b"],
    ["state", "hello world"],
  ]);
  assert.deepEqual(Object.entries(queryString.parse(unicodeValue)), [["city", "Zürich"]]);
  assert.deepEqual(Object.entries(queryString.parse(malformedValue)), [["malformed", "%E0%A4%A"]]);
});
