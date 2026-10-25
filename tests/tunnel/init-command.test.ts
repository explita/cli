import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInitCommand } from "../../src/tunnel/commands/init.js";
import { DEFAULT_SCHEMA_URL } from "@explita/infra-protocol";

test("eta init creates explita.json with tunnel configuration", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explita-tunnel-init-"));
  try {
    await runInitCommand(["3000", "-s", "my-subdomain"], dir);

    const configPath = join(dir, "explita.json");
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);

    assert.equal(parsed.$schema, DEFAULT_SCHEMA_URL);
    assert.ok(parsed.tunnel);
    assert.equal(parsed.tunnel.port, 3000);
    assert.equal(parsed.tunnel.subdomain, "my-subdomain");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("eta init warns and does not overwrite if tunnel key exists without --force", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explita-tunnel-init-exists-"));
  try {
    // Initial run
    await runInitCommand(["3000", "-s", "first-subdomain"], dir);

    // Second run without --force attempting to change to 8080
    await runInitCommand(["8080", "-s", "second-subdomain"], dir);

    const configPath = join(dir, "explita.json");
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);

    // Should retain initial values
    assert.equal(parsed.tunnel.port, 3000);
    assert.equal(parsed.tunnel.subdomain, "first-subdomain");

    // Third run with --force
    await runInitCommand(["8080", "-s", "second-subdomain", "--force"], dir);

    const updatedRaw = readFileSync(configPath, "utf8");
    const updated = JSON.parse(updatedRaw);

    assert.equal(updated.tunnel.port, 8080);
    assert.equal(updated.tunnel.subdomain, "second-subdomain");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
