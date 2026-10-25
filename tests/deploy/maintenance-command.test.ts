import test from "node:test";
import assert from "node:assert/strict";
import { formatMaintenanceStatus } from "../../src/deploy/commands/maintenance.js";
import { handleDeployCommand } from "../../src/deploy/commands/deploy.js";

test("formatMaintenanceStatus renders OFF state", () => {
  const output = formatMaintenanceStatus(
    {
      enabled: false,
      message: null,
      enabledAt: null,
    },
    "app-123",
  );

  assert.ok(output.includes("Maintenance Status"));
  assert.ok(output.includes("app-123"));
  assert.ok(output.includes("OFF (Normal Traffic)"));
});

test("formatMaintenanceStatus renders ON state with message and timestamp", () => {
  const timestamp = "2026-10-11T12:00:00.000Z";
  const output = formatMaintenanceStatus(
    {
      enabled: true,
      message: "Database migration in progress",
      enabledAt: timestamp,
    },
    "app-456",
  );

  assert.ok(output.includes("Maintenance Status"));
  assert.ok(output.includes("app-456"));
  assert.ok(output.includes("ON (Active)"));
  assert.ok(output.includes("Database migration in progress"));
  assert.ok(output.includes("eda maintenance off -a app-456"));
});

test("formatMaintenanceStatus displays custom template indicator when active", () => {
  const output = formatMaintenanceStatus(
    {
      enabled: true,
      message: "Custom page active",
      enabledAt: "2026-10-11T12:00:00.000Z",
      customPage: true,
    },
    "app-789",
  );

  assert.ok(output.includes("Custom HTML template active"));
});

test("eda mm --help dispatches to maintenance help", async () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.join(" "));
  };

  try {
    await handleDeployCommand(["mm", "--help"]);
    assert.ok(logs.some((l) => l.includes("Maintenance")));
    assert.ok(logs.some((l) => l.includes("503 maintenance mode")));
  } finally {
    console.log = originalLog;
  }
});
