import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseAppCommand,
  resolveAppId,
  tryResolveAppId,
} from "../../src/deploy/lib/resolve-app.js";

test("resolveAppId returns explicit appId when provided", () => {
  const result = resolveAppId("explicit-app-123");
  assert.equal(result, "explicit-app-123");
});

test("resolveAppId falls back to deploy.appId in local config", () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-resolve-app-"));
  const originalCwd = process.cwd();
  try {
    const configContent = JSON.stringify({
      deploy: {
        appId: "config-app-456",
        name: "my-app",
      },
    });
    writeFileSync(join(tmp, "explita.json"), configContent, "utf8");
    process.chdir(tmp);

    const result = resolveAppId(undefined, "logs");
    assert.equal(result, "config-app-456");
  } finally {
    process.chdir(originalCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("resolveAppId throws error when neither flag nor config appId is provided", () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-resolve-app-empty-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(tmp);
    assert.throws(
      () => {
        resolveAppId(undefined, "restart");
      },
      {
        message:
          'Application ID is required for "restart". Provide -a/--app <appId> or define deploy.appId in explita.json.',
      },
    );
  } finally {
    process.chdir(originalCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("parseAppCommand extracts appId and positionals from CLI args", () => {
  const parsed = parseAppCommand(
    ["api.example.com", "-a", "app-999"],
    "domain add",
  );
  assert.equal(parsed.appId, "app-999");
  assert.deepEqual(parsed.positionals, ["api.example.com"]);
});

test("parseAppCommand falls back to local config when -a is not passed", () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-parse-app-cmd-"));
  const originalCwd = process.cwd();
  try {
    const configContent = JSON.stringify({
      deploy: {
        appId: "pinned-app-789",
      },
    });
    writeFileSync(join(tmp, "explita.json"), configContent, "utf8");
    process.chdir(tmp);

    const parsed = parseAppCommand(["enable"], "tunnel");
    assert.equal(parsed.appId, "pinned-app-789");
    assert.deepEqual(parsed.positionals, ["enable"]);
  } finally {
    process.chdir(originalCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("tryResolveAppId returns undefined instead of throwing when not configured", () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-try-resolve-app-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(tmp);
    const result = tryResolveAppId(undefined);
    assert.equal(result, undefined);
  } finally {
    process.chdir(originalCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("parseAppCommand with optional: true returns undefined appId when missing without throwing", () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-parse-app-cmd-opt-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(tmp);
    const parsed = parseAppCommand(
      ["--all"],
      "stats",
      { all: { type: "boolean", short: "A" } },
      { optional: true },
    );
    assert.equal(parsed.appId, undefined);
    assert.equal(parsed.values.all, true);
  } finally {
    process.chdir(originalCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});
