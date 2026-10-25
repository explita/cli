import test from "node:test";
import assert from "node:assert/strict";
import { parseSemver, isNewerVersion } from "@explita/infra-protocol";
import {
  checkServerVersionUpdate,
  saveUpdateCache,
  loadUpdateCache,
  recordObservedServerVersion,
} from "../../src/deploy/lib/version-check.js";

test("parseSemver correctly parses version numbers", () => {
  assert.deepEqual(parseSemver("0.1.0"), [0, 1, 0]);
  assert.deepEqual(parseSemver("v1.2.3"), [1, 2, 3]);
  assert.deepEqual(parseSemver("v2.0.0-beta.1"), [2, 0, 0]);
  assert.equal(parseSemver("invalid"), null);
  assert.equal(parseSemver(""), null);
});

test("isNewerVersion identifies newer and older versions correctly", () => {
  assert.equal(isNewerVersion("0.1.0", "0.2.0"), true);
  assert.equal(isNewerVersion("0.1.0", "1.0.0"), true);
  assert.equal(isNewerVersion("0.1.0", "0.1.1"), true);
  assert.equal(isNewerVersion("1.0.0", "1.0.0"), false);
  assert.equal(isNewerVersion("1.1.0", "1.0.0"), false);
  assert.equal(isNewerVersion("0.2.0", "0.1.9"), false);
});

test("recordObservedServerVersion saves server version to local update cache", () => {
  recordObservedServerVersion("0.1.0");
  const cache = loadUpdateCache();
  assert.equal(cache.lastObservedServerVersion, "0.1.0");
});

test("checkServerVersionUpdate detects when remote server is outdated using cache", async () => {
  saveUpdateCache({
    checkedAt: Date.now(),
    latestDeployVersion: "0.2.0",
  });

  const checkOutdated = await checkServerVersionUpdate("0.1.0");
  assert.equal(checkOutdated.hasUpdate, true);
  assert.equal(checkOutdated.latestVersion, "0.2.0");

  const checkCurrent = await checkServerVersionUpdate("0.2.0");
  assert.equal(checkCurrent.hasUpdate, false);
});
