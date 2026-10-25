import test from "node:test";
import assert from "node:assert/strict";
import { runDoctorCommand } from "../../src/deploy/commands/doctor.js";

test("eda doctor --help does not throw and outputs help", async () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.join(" "));
  };

  try {
    await runDoctorCommand(["--help"]);
    assert.ok(logs.some((l) => l.includes("Run pre-flight connectivity, server health, and local project checks")));
    assert.ok(logs.some((l) => l.includes("eda doctor")));
  } finally {
    console.log = originalLog;
  }
});
