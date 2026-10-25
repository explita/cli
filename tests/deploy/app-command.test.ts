import test from "node:test";
import assert from "node:assert/strict";
import { runAppCommand } from "../../src/deploy/commands/app.js";

test("eda rm throws if -a is missing", async () => {
  await assert.rejects(
    async () => {
      await runAppCommand(["rm"]);
    },
    {
      message: /Application ID is required to delete an application/,
    },
  );
});

test("eda rm throws in non-interactive environment if -y/--yes is omitted", async () => {
  // node:test runs in non-interactive mode where process.stdin.isTTY is false or undefined
  await assert.rejects(
    async () => {
      await runAppCommand(["rm", "-a", "test-app-id"]);
    },
    {
      message:
        /Cannot prompt for confirmation in a non-interactive environment/,
    },
  );
});

test("eda rm -a <appId> -y cleans up local explita.json appId", async () => {
  const { mkdtempSync, rmSync, readFileSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const tmp = mkdtempSync(join(tmpdir(), "explita-rm-test-"));
  const origCwd = process.cwd();
  const origFetch = globalThis.fetch;
  const origServer = process.env.EXPLITA_DEPLOY_SERVER;
  const origToken = process.env.EXPLITA_DEPLOY_TOKEN;

  try {
    process.env.EXPLITA_DEPLOY_SERVER = "http://localhost:3000";
    process.env.EXPLITA_DEPLOY_TOKEN = "test-token";

    // Write initial explita.json with deploy.appId
    const configPath = join(tmp, "explita.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          deploy: {
            name: "test-app",
            appId: "app_target123",
            port: 3000,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    // Mock fetch for GET and DELETE /api/apps/app_target123
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          success: true,
          data: { id: "app_target123", name: "test-app" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    };

    process.chdir(tmp);

    await runAppCommand(["rm", "-a", "app_target123", "-y"]);

    // Read back explita.json
    const updated = JSON.parse(readFileSync(configPath, "utf8"));
    assert.equal(updated.deploy.name, "test-app");
    assert.equal(updated.deploy.port, 3000);
    assert.equal(updated.deploy.appId, undefined);
  } finally {
    process.chdir(origCwd);
    globalThis.fetch = origFetch;
    if (origServer !== undefined) {
      process.env.EXPLITA_DEPLOY_SERVER = origServer;
    } else {
      delete process.env.EXPLITA_DEPLOY_SERVER;
    }
    if (origToken !== undefined) {
      process.env.EXPLITA_DEPLOY_TOKEN = origToken;
    } else {
      delete process.env.EXPLITA_DEPLOY_TOKEN;
    }
    rmSync(tmp, { recursive: true, force: true });
  }
});

