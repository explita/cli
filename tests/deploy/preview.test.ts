import test from "node:test";
import assert from "node:assert/strict";
import { runPromoteCommand } from "../../src/deploy/commands/promote.js";
import { normalizeDeployArgs } from "../../src/deploy/commands/deploy.js";
import { parseArgs } from "node:util";

test("eda promote --help does not throw and outputs help", async () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.join(" "));
  };

  try {
    await runPromoteCommand(["--help"]);
    assert.ok(logs.some((l) => l.includes("Promote a preview deployment to production")));
    assert.ok(logs.some((l) => l.includes("eda promote")));
  } finally {
    console.log = originalLog;
  }
});

test("eda promote requires deployment ID", async () => {
  await assert.rejects(
    async () => {
      await runPromoteCommand([]);
    },
    {
      message: /Deployment ID is required: explita deploy promote <deploymentId>/,
    },
  );
});

test("deploy command parses --preview flag properly", () => {
  const parsed = parseArgs({
    args: ["--preview", "-p", "4000", "-a", "app123"],
    options: {
      app: { type: "string", short: "a" },
      port: { type: "string", short: "p" },
      preview: { type: "boolean" },
    },
  });

  assert.equal(parsed.values.preview, true);
  assert.equal(parsed.values.port, "4000");
  assert.equal(parsed.values.app, "app123");
});

test("deploy command parses --clone-db as boolean and with custom db name", () => {
  const normalize = (args: string[]) => {
    const res: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--clone-db") {
        const next = args[i + 1];
        if (next && !next.startsWith("-")) {
          res.push(`--clone-db=${next}`);
          i++;
        } else {
          res.push("--clone-db=true");
        }
      } else {
        res.push(arg);
      }
    }
    return res;
  };

  const p1 = parseArgs({
    args: normalize(["--preview", "--clone-db"]),
    options: {
      preview: { type: "boolean" },
      "clone-db": { type: "string" },
    },
  });
  assert.equal(p1.values.preview, true);
  assert.equal(p1.values["clone-db"], "true");

  const p2 = parseArgs({
    args: normalize(["--preview", "--clone-db", "my_custom_db"]),
    options: {
      preview: { type: "boolean" },
      "clone-db": { type: "string" },
    },
  });
  assert.equal(p2.values.preview, true);
  assert.equal(p2.values["clone-db"], "my_custom_db");

  const p3 = parseArgs({
    args: normalize(["--preview", "--clone-db=analytics_db"]),
    options: {
      preview: { type: "boolean" },
      "clone-db": { type: "string" },
    },
  });
  assert.equal(p3.values.preview, true);
  assert.equal(p3.values["clone-db"], "analytics_db");
});


test("resolvePreviewAction defaults to keep on enter, k, n, or arbitrary input", async () => {
  const { resolvePreviewAction } = await import("../../src/deploy/lib/confirm.js");

  assert.equal(resolvePreviewAction(""), "keep");
  assert.equal(resolvePreviewAction("  "), "keep");
  assert.equal(resolvePreviewAction("k"), "keep");
  assert.equal(resolvePreviewAction("keep"), "keep");
  assert.equal(resolvePreviewAction("n"), "keep");
  assert.equal(resolvePreviewAction("no"), "keep");
  assert.equal(resolvePreviewAction("later"), "keep");
});

test("resolvePreviewAction identifies promote and discard explicitly", async () => {
  const { resolvePreviewAction } = await import("../../src/deploy/lib/confirm.js");

  assert.equal(resolvePreviewAction("y"), "promote");
  assert.equal(resolvePreviewAction("yes"), "promote");
  assert.equal(resolvePreviewAction("p"), "promote");
  assert.equal(resolvePreviewAction("promote"), "promote");

  assert.equal(resolvePreviewAction("d"), "discard");
  assert.equal(resolvePreviewAction("discard"), "discard");
  assert.equal(resolvePreviewAction("delete"), "discard");
  assert.equal(resolvePreviewAction("rm"), "discard");
});

test("deploy command parses -t / --tunnel and --tag options", () => {
  const parseDeployArgs = (args: string[]) =>
    parseArgs({
      args,
      options: {
        app: { type: "string", short: "a" },
        port: { type: "string", short: "p" },
        tag: { type: "string" },
        tunnel: { type: "boolean", short: "t" },
        preview: { type: "boolean" },
      },
      strict: true,
    });

  const withTunnel = parseDeployArgs(["-t", "--preview"]);
  assert.equal(withTunnel.values.tunnel, true);
  assert.equal(withTunnel.values.preview, true);

  const withLongTag = parseDeployArgs(["--tag", "production"]);
  assert.equal(withLongTag.values.tag, "production");

  const withBoth = parseDeployArgs(["-t", "--tag", "main"]);
  assert.equal(withBoth.values.tunnel, true);
  assert.equal(withBoth.values.tag, "main");
});

test("deploy command parses --auth correctly", () => {
  const p1 = parseArgs({
    args: ["--preview", "--auth", "admin:supersecret"],
    options: {
      preview: { type: "boolean" },
      auth: { type: "string" },
    },
  });

  assert.equal(p1.values.preview, true);
  assert.equal(p1.values.auth, "admin:supersecret");
});

test("validates preview-auth format username:password", () => {
  const validateAuth = (authStr: string) => {
    const colonIdx = authStr.indexOf(":");
    if (colonIdx <= 0 || colonIdx === authStr.length - 1) {
      throw new Error(`Invalid preview auth format: "${authStr}".`);
    }
    return authStr.trim();
  };

  assert.equal(validateAuth("admin:secret"), "admin:secret");
  assert.equal(validateAuth("alice:pass123"), "alice:pass123");
  assert.throws(() => validateAuth("noseparator"), /Invalid preview auth format/);
  assert.throws(() => validateAuth(":nopassword"), /Invalid preview auth format/);
  assert.throws(() => validateAuth("nouser:"), /Invalid preview auth format/);
});

test("normalizeDeployArgs handles --tunnel and -t flags properly", () => {
  // Test --tunnel=false
  const eqFalse = normalizeDeployArgs(["-n", "app", "--tunnel=false"]);
  assert.equal(eqFalse.explicitTunnel, false);
  assert.deepEqual(eqFalse.normalizedArgs, ["-n", "app"]);

  // Test --tunnel false
  const spaceFalse = normalizeDeployArgs(["-n", "app", "--tunnel", "false"]);
  assert.equal(spaceFalse.explicitTunnel, false);
  assert.deepEqual(spaceFalse.normalizedArgs, ["-n", "app"]);

  // Test -t=false
  const shortEqFalse = normalizeDeployArgs(["-n", "app", "-t=false"]);
  assert.equal(shortEqFalse.explicitTunnel, false);
  assert.deepEqual(shortEqFalse.normalizedArgs, ["-n", "app"]);

  // Test -t false
  const shortSpaceFalse = normalizeDeployArgs(["-n", "app", "-t", "false"]);
  assert.equal(shortSpaceFalse.explicitTunnel, false);
  assert.deepEqual(shortSpaceFalse.normalizedArgs, ["-n", "app"]);

  // Test --no-tunnel
  const noTunnel = normalizeDeployArgs(["-n", "app", "--no-tunnel"]);
  assert.equal(noTunnel.explicitTunnel, false);
  assert.deepEqual(noTunnel.normalizedArgs, ["-n", "app"]);

  // Test --tunnel=true
  const eqTrue = normalizeDeployArgs(["-n", "app", "--tunnel=true"]);
  assert.equal(eqTrue.explicitTunnel, true);
  assert.deepEqual(eqTrue.normalizedArgs, ["-n", "app"]);

  // Test --tunnel true
  const spaceTrue = normalizeDeployArgs(["-n", "app", "--tunnel", "true"]);
  assert.equal(spaceTrue.explicitTunnel, true);
  assert.deepEqual(spaceTrue.normalizedArgs, ["-n", "app"]);

  // Test -t standalone
  const shortAlone = normalizeDeployArgs(["-n", "app", "-t"]);
  assert.equal(shortAlone.explicitTunnel, true);
  assert.deepEqual(shortAlone.normalizedArgs, ["-n", "app"]);

  // Test --tunnel standalone
  const longAlone = normalizeDeployArgs(["-n", "app", "--tunnel"]);
  assert.equal(longAlone.explicitTunnel, true);
  assert.deepEqual(longAlone.normalizedArgs, ["-n", "app"]);

  // Test no tunnel flag (undefined)
  const none = normalizeDeployArgs(["-n", "app"]);
  assert.equal(none.explicitTunnel, undefined);
  assert.deepEqual(none.normalizedArgs, ["-n", "app"]);
});



