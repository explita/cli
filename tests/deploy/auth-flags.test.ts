import test from "node:test";
import assert from "node:assert/strict";
import { extractAuthFlags } from "../../src/deploy/commands/deploy.js";
import { setSessionAuth, getSessionPass, getSessionOtp } from "../../src/deploy/lib/api.js";

test("extractAuthFlags extracts --pass flag and cleans arguments", () => {
  const result = extractAuthFlags(["ls", "--pass", "12345", "-s", "web"]);
  assert.equal(result.pass, "12345");
  assert.equal(result.otp, undefined);
  assert.deepEqual(result.cleanArgs, ["ls", "-s", "web"]);
});

test("extractAuthFlags extracts --pass=value inline syntax", () => {
  const result = extractAuthFlags(["deploy", "--pass=my-secret-pin", "-a", "app"]);
  assert.equal(result.pass, "my-secret-pin");
  assert.deepEqual(result.cleanArgs, ["deploy", "-a", "app"]);
});

test("extractAuthFlags extracts --otp flag and cleans arguments", () => {
  const result = extractAuthFlags(["stats", "--otp", "654321"]);
  assert.equal(result.otp, "654321");
  assert.deepEqual(result.cleanArgs, ["stats"]);
});

test("extractAuthFlags handles both --pass and --otp simultaneously", () => {
  const result = extractAuthFlags(["db", "url", "--pass", "pin99", "--otp=112233"]);
  assert.equal(result.pass, "pin99");
  assert.equal(result.otp, "112233");
  assert.deepEqual(result.cleanArgs, ["db", "url"]);
});

test("setSessionAuth updates in-memory credentials", () => {
  setSessionAuth({ pass: "pin-test", otp: "999888" });
  assert.equal(getSessionPass(), "pin-test");
  assert.equal(getSessionOtp(), "999888");

  // Reset
  setSessionAuth({ pass: "", otp: "" });
  assert.equal(getSessionPass(), undefined);
  assert.equal(getSessionOtp(), undefined);
});
