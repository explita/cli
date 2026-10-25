import test from "node:test";
import assert from "node:assert/strict";
import { parseAppCommand } from "../../src/deploy/lib/resolve-app.js";
import { formatSize } from "@explita/infra-protocol";

test("db backup schedule parses presets, custom cron, and retention limit", () => {
  const { appId, values } = parseAppCommand(
    ["-a", "test-app", "--daily", "--keep", "7"],
    "db backup schedule",
    {
      daily: { type: "boolean" },
      hourly: { type: "boolean" },
      weekly: { type: "boolean" },
      cron: { type: "string" },
      keep: { type: "string" },
      disable: { type: "boolean" },
    },
  );

  assert.equal(appId, "test-app");
  assert.equal(values.daily, true);
  assert.equal(values.keep, "7");
});

test("db backup schedule parses custom cron and disable flag", () => {
  const { appId, values } = parseAppCommand(
    ["-a", "prod-app", "--cron", "0 3 * * 1-5", "--disable"],
    "db backup schedule",
    {
      daily: { type: "boolean" },
      hourly: { type: "boolean" },
      weekly: { type: "boolean" },
      cron: { type: "string" },
      keep: { type: "string" },
      disable: { type: "boolean" },
    },
  );

  assert.equal(appId, "prod-app");
  assert.equal(values.cron, "0 3 * * 1-5");
  assert.equal(values.disable, true);
});

test("db backup restore parses target backupId and confirmation bypass flag", () => {
  const { appId, positionals, values } = parseAppCommand(
    ["-a", "my-app", "backup-2026-10-10T12-00-00-000Z.sql.gz", "-y"],
    "db backup restore",
    {
      yes: { type: "boolean", short: "y" },
    },
  );

  assert.equal(appId, "my-app");
  assert.equal(positionals[0], "backup-2026-10-10T12-00-00-000Z.sql.gz");
  assert.equal(values.yes, true);
});

test("db backup rm parses target backupId positional", () => {
  const { appId, positionals } = parseAppCommand(
    ["-a", "my-app", "backup-old.sql.gz"],
    "db backup rm",
  );

  assert.equal(appId, "my-app");
  assert.equal(positionals[0], "backup-old.sql.gz");
});

test("formatSize accurately formats byte sizes", () => {
  assert.equal(formatSize(0), "0 B");
  assert.equal(formatSize(512), "512 B");
  assert.equal(formatSize(1024), "1.0 KB");
  assert.equal(formatSize(10 * 1024 * 1024), "10 MB");
  assert.equal(formatSize(1.5 * 1024 * 1024 * 1024), "1.5 GB");
});
