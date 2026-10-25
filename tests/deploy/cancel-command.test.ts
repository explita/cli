import test from "node:test";
import assert from "node:assert/strict";
import { runCancelCommand } from "../../src/deploy/commands/cancel.js";

test("eda cancel --help does not throw and outputs help", async () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.join(" "));
  };

  try {
    await runCancelCommand(["--help"]);
    assert.ok(logs.some((l) => l.includes("Abort an in-progress deployment and clean up resources")));
    assert.ok(logs.some((l) => l.includes("eda cancel")));
  } finally {
    console.log = originalLog;
  }
});

test("eda cancel throws error if deploymentId is not provided", async () => {
  await assert.rejects(
    async () => {
      await runCancelCommand([]);
    },
    {
      message: /Deployment ID is required: eda cancel <deploymentId>/,
    },
  );
});
