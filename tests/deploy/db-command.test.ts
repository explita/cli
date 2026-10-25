import test from "node:test";
import assert from "node:assert/strict";
import { parseAppCommand } from "../../src/deploy/lib/resolve-app.js";

test("db create parses optional -t, -n, -u, -p and required -a", () => {
  const { appId, values } = parseAppCommand(
    ["-a", "my-app", "-t", "mysql", "-n", "custom_db", "-u", "custom_user", "-p", "secret123"],
    "db create",
    {
      type: { type: "string", short: "t" },
      name: { type: "string", short: "n" },
      user: { type: "string", short: "u" },
      pass: { type: "string", short: "p" },
    },
  );

  assert.equal(appId, "my-app");
  assert.equal(values.type, "mysql");
  assert.equal(values.name, "custom_db");
  assert.equal(values.user, "custom_user");
  assert.equal(values.pass, "secret123");
});

test("db url parses -a correctly", () => {
  const { appId } = parseAppCommand(["-a", "target-app-1"], "db url");
  assert.equal(appId, "target-app-1");
});

test("db seed parses positional file and -a flag", () => {
  const { appId, positionals, values } = parseAppCommand(
    ["seeds/init.sql", "-a", "target-app-1"],
    "db seed",
    {
      file: { type: "string", short: "f" },
    },
  );
  assert.equal(appId, "target-app-1");
  assert.equal(positionals[0], "seeds/init.sql");
  assert.equal(values.file, undefined);
});

test("db seed parses -f flag", () => {
  const { appId, values } = parseAppCommand(
    ["-f", "seeds/init.sql", "-a", "target-app-1"],
    "db seed",
    {
      file: { type: "string", short: "f" },
    },
  );
  assert.equal(appId, "target-app-1");
  assert.equal(values.file, "seeds/init.sql");
});
