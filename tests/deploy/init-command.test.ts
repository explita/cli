import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDeployInitCommand } from "../../src/deploy/commands/init.js";
import { DEFAULT_SCHEMA_URL } from "@explita/infra-protocol";

test("eda init creates explita.json with $schema and defaults", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explita-init-test-"));
  try {
    await runDeployInitCommand([], dir);

    const configPath = join(dir, "explita.json");
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);

    assert.equal(parsed.$schema, DEFAULT_SCHEMA_URL);
    assert.ok(parsed.deploy);
    assert.equal(typeof parsed.deploy.name, "string");
    assert.equal(parsed.deploy.port, 3000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("eda init detects name from package.json and port from Dockerfile", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explita-init-detect-"));
  try {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "my-detected-pkg" }),
      "utf8",
    );
    writeFileSync(
      join(dir, "Dockerfile"),
      "FROM node:24\nEXPOSE 5000\n",
      "utf8",
    );

    await runDeployInitCommand([], dir);

    const configPath = join(dir, "explita.json");
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);

    assert.equal(parsed.$schema, DEFAULT_SCHEMA_URL);
    assert.equal(parsed.deploy.name, "my-detected-pkg");
    assert.equal(parsed.deploy.port, 5000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("eda init applies explicit flags (-n, -p, -d) and stores domains as an array", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explita-init-flags-"));
  try {
    await runDeployInitCommand(
      ["-n", "custom-service", "-p", "8080", "-d", "custom.domain.com"],
      dir,
    );

    const configPath = join(dir, "explita.json");
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);

    assert.equal(parsed.$schema, DEFAULT_SCHEMA_URL);
    assert.equal(parsed.deploy.name, "custom-service");
    assert.equal(parsed.deploy.port, 8080);
    assert.deepEqual(parsed.deploy.domains, ["custom.domain.com"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("eda init supports multiple domains and comma-separated domains", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explita-init-multi-domains-"));
  try {
    await runDeployInitCommand(
      [
        "-n",
        "multi-domain-service",
        "-d",
        "a.example.com",
        "-d",
        "b.example.com, c.example.com",
      ],
      dir,
    );

    const configPath = join(dir, "explita.json");
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);

    assert.deepEqual(parsed.deploy.domains, [
      "a.example.com",
      "b.example.com",
      "c.example.com",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("eda init warns and does not overwrite if deploy key already exists without --force", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explita-init-exists-"));
  try {
    // Initial run
    await runDeployInitCommand(["-n", "initial-app", "-p", "3000"], dir);

    // Second run without --force attempting to change port
    await runDeployInitCommand(["-n", "changed-app", "-p", "8080"], dir);

    const configPath = join(dir, "explita.json");
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);

    // Should still have original values
    assert.equal(parsed.deploy.name, "initial-app");
    assert.equal(parsed.deploy.port, 3000);

    // Third run with --force
    await runDeployInitCommand(
      ["-n", "changed-app", "-p", "8080", "--force"],
      dir,
    );

    const updatedRaw = readFileSync(configPath, "utf8");
    const updated = JSON.parse(updatedRaw);

    assert.equal(updated.deploy.name, "changed-app");
    assert.equal(updated.deploy.port, 8080);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
