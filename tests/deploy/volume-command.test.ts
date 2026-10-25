import test from "node:test";
import assert from "node:assert/strict";
import { runVolumeCommand } from "../../src/deploy/commands/volume.js";

test("eda volume --help prints help and does not throw", async () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.join(" "));
  };

  try {
    await runVolumeCommand(["--help"]);
    assert.ok(
      logs.some((l) =>
        l.includes("Inspect persistent Docker volumes and storage mounts"),
      ),
    );
    assert.ok(logs.some((l) => l.includes("eda volume")));
  } finally {
    console.log = originalLog;
  }
});

test("eda volume inspect prints error when volume name is missing", async () => {
  const errLogs: string[] = [];
  const originalError = console.error;
  const originalExit = process.exit;

  console.error = (...args: any[]) => {
    errLogs.push(args.join(" "));
  };

  let exitCode: number | undefined;
  (process as any).exit = (code: number) => {
    exitCode = code;
    throw new Error(`process.exit called with ${code}`);
  };

  try {
    await assert.rejects(
      async () => {
        await runVolumeCommand(["inspect"]);
      },
      { message: /process\.exit called with 1/ },
    );
    assert.equal(exitCode, 1);
    assert.ok(errLogs.some((l) => l.includes("Missing volume name")));
  } finally {
    console.error = originalError;
    process.exit = originalExit;
  }
});

test("eda volume rm prints error when volume name is missing", async () => {
  const errLogs: string[] = [];
  const originalError = console.error;
  const originalExit = process.exit;

  console.error = (...args: any[]) => {
    errLogs.push(args.join(" "));
  };

  let exitCode: number | undefined;
  (process as any).exit = (code: number) => {
    exitCode = code;
    throw new Error(`process.exit called with ${code}`);
  };

  try {
    await assert.rejects(
      async () => {
        await runVolumeCommand(["rm"]);
      },
      { message: /process\.exit called with 1/ },
    );
    assert.equal(exitCode, 1);
    assert.ok(errLogs.some((l) => l.includes("Missing volume name")));
  } finally {
    console.error = originalError;
    process.exit = originalExit;
  }
});

