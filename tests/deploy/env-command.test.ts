import test from "node:test";
import assert from "node:assert/strict";
import { parseAppCommand } from "../../src/deploy/lib/resolve-app.js";

test("env diff parses positional file and options", () => {
  const { appId, positionals, values } = parseAppCommand(
    [".env.production", "-a", "my-app", "--show-values"],
    "env diff",
    {
      file: { type: "string", short: "f" },
      "show-values": { type: "boolean", short: "s", default: false },
    },
  );

  assert.equal(appId, "my-app");
  assert.equal(positionals[0], ".env.production");
  assert.equal(values["show-values"], true);
});

test("env diff parses -f flag and -s short flag", () => {
  const { appId, positionals, values } = parseAppCommand(
    ["-f", ".env.staging", "-a", "my-app", "-s", "-A"],
    "env diff",
    {
      file: { type: "string", short: "f" },
      "show-values": { type: "boolean", short: "s", default: false },
      all: { type: "boolean", short: "A", default: false },
    },
  );

  assert.equal(appId, "my-app");
  assert.equal(values.file, ".env.staging");
  assert.equal(values["show-values"], true);
  assert.equal(values.all, true);
});

test("env set parses --apply flag", () => {
  const { appId, positionals, values } = parseAppCommand(
    ["FOO=BAR", "BAZ=QUX", "-a", "my-app", "--apply"],
    "env set",
    {
      file: { type: "string", short: "f" },
      apply: { type: "boolean" },
    },
  );

  assert.equal(appId, "my-app");
  assert.deepEqual(positionals, ["FOO=BAR", "BAZ=QUX"]);
  assert.equal(values.apply, true);
});

test("env rm parses --apply flag", () => {
  const { appId, positionals, values } = parseAppCommand(
    ["FOO", "BAZ", "-a", "my-app", "--apply"],
    "env rm",
    {
      apply: { type: "boolean" },
    },
  );

  assert.equal(appId, "my-app");
  assert.deepEqual(positionals, ["FOO", "BAZ"]);
  assert.equal(values.apply, true);
});

test("env apply resolves appId", () => {
  const { appId } = parseAppCommand(["-a", "my-app"], "env apply");
  assert.equal(appId, "my-app");
});

test("deploy command parses repeatable -e and --env-file flags", async () => {
  const { parseArgs } = await import("node:util");
  const { values } = parseArgs({
    args: [
      "-e",
      "API_KEY=secret123",
      "--env",
      "PORT=8080",
      "--env-file",
      ".env.production",
      "-a",
      "my-app",
    ],
    options: {
      app: { type: "string", short: "a" },
      env: { type: "string", multiple: true, short: "e" },
      "env-file": { type: "string" },
    },
  });

  assert.equal(values.app, "my-app");
  assert.deepEqual(values.env, ["API_KEY=secret123", "PORT=8080"]);
  assert.equal(values["env-file"], ".env.production");
});


