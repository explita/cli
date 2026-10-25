import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatNotifyConfig,
  runNotifyCommand,
} from "../../src/deploy/commands/notify.js";
import { loadProjectConfig, saveProjectConfig } from "@explita/infra-protocol";

test("formatNotifyConfig outputs helpful guide when no destinations configured", () => {
  const output = formatNotifyConfig(null);
  assert.ok(output.includes("No alert destinations configured"));
  assert.ok(output.includes("eda notify set --discord"));
  assert.ok(output.includes("eda notify set --telegram"));
});

test("formatNotifyConfig displays configured channels and masks webhook URLs", () => {
  const output = formatNotifyConfig({
    discord: "https://discord.com/api/webhooks/1234567890/ABCDEFGHIJKLMN",
    slack: "https://hooks.slack.com/services/T00/B00/XXXX",
    telegram: "-100987654321",
    events: ["deployment_failed", "container_unhealthy"],
  });

  assert.ok(output.includes("Discord :"));
  assert.ok(output.includes("https://discord.com/api/webhooks/"));
  assert.ok(output.includes("Slack   :"));
  assert.ok(output.includes("Telegram:"));
  assert.ok(output.includes("-100987654321"));
  assert.ok(output.includes("deployment_failed, container_unhealthy"));
});

test("eda notify set persists discord and telegram to project config", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-notify-test-"));
  const origCwd = process.cwd();

  try {
    process.chdir(tmp);
    saveProjectConfig({ deploy: { name: "test-app", port: 3000 } }, tmp);

    // Run notify set --discord
    await runNotifyCommand([
      "set",
      "--discord",
      "https://discord.com/api/webhooks/111/test",
    ]);

    let loaded = loadProjectConfig(tmp);
    assert.equal(
      loaded?.config.deploy?.notify?.discord,
      "https://discord.com/api/webhooks/111/test",
    );

    // Run notify set --telegram with chat ID and token
    await runNotifyCommand([
      "set",
      "--telegram",
      "-100123456789",
      "--telegram-token",
      "bot12345:TOKEN",
      "--events",
      "deployment_failed,cron_failed",
    ]);

    loaded = loadProjectConfig(tmp);
    assert.equal(
      loaded?.config.deploy?.notify?.discord,
      "https://discord.com/api/webhooks/111/test",
    );
    assert.deepEqual(loaded?.config.deploy?.notify?.telegram, {
      chatId: "-100123456789",
      token: "bot12345:TOKEN",
    });
    assert.deepEqual(loaded?.config.deploy?.notify?.events, [
      "deployment_failed",
      "cron_failed",
    ]);

    // Run notify rm --discord
    await runNotifyCommand(["rm", "--discord"]);

    loaded = loadProjectConfig(tmp);
    assert.equal(loaded?.config.deploy?.notify?.discord, undefined);
    assert.ok(loaded?.config.deploy?.notify?.telegram);
  } finally {
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
});
