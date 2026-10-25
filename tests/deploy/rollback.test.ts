import test from "node:test";
import assert from "node:assert/strict";
import { runRollbackCommand } from "../../src/deploy/commands/rollback.js";

test("eda rollback --help does not throw and outputs help", async () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.join(" "));
  };

  try {
    await runRollbackCommand(["--help"]);
    assert.ok(logs.some((l) => l.includes("Roll back production traffic or discard a preview deployment")));
    assert.ok(logs.some((l) => l.includes("--purge")));
  } finally {
    console.log = originalLog;
  }
});

test("eda rollback throws if deployment ID is missing", async () => {
  await assert.rejects(
    async () => {
      await runRollbackCommand([]);
    },
    {
      message: /Deployment ID is required/,
    },
  );
});
