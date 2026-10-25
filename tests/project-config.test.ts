import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defineConfig,
  loadProjectConfig,
  saveProjectConfig,
  normalizeHealthCheck,
  normalizeDomains,
} from "@explita/infra-protocol";

test("defineConfig returns the exact config provided", () => {
  const config = defineConfig({
    tunnel: {
      port: 3000,
      subdomain: "my-app",
    },
    deploy: {
      name: "my-deploy",
      port: 8080,
    },
  });

  assert.deepEqual(config, {
    tunnel: {
      port: 3000,
      subdomain: "my-app",
    },
    deploy: {
      name: "my-deploy",
      port: 8080,
    },
  });
});

test("project config loads explita.json", () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-config-test-"));
  try {
    const jsonContent = JSON.stringify({
      tunnel: { port: 5000, subdomain: "test-tunnel" },
      deploy: { name: "test-app" },
    });
    writeFileSync(join(tmp, "explita.json"), jsonContent, "utf8");

    const loaded = loadProjectConfig(tmp);
    assert.ok(loaded);
    assert.equal(loaded.config.tunnel?.port, 5000);
    assert.equal(loaded.config.tunnel?.subdomain, "test-tunnel");
    assert.equal(loaded.config.deploy?.name, "test-app");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("saveProjectConfig creates explita.json with $schema and preserves keys", () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-config-test-"));
  try {
    const res1 = saveProjectConfig({ tunnel: { port: 3000 } }, tmp);
    assert.ok(res1.path.endsWith("explita.json"));
    assert.ok(res1.config.$schema);
    assert.equal(res1.config.tunnel?.port, 3000);

    // Save deploy section to same file
    const res2 = saveProjectConfig(
      { deploy: { name: "app-1", port: 3000 } },
      tmp,
    );
    assert.equal(res2.config.tunnel?.port, 3000);
    assert.equal(res2.config.deploy?.name, "app-1");

    // Load from disk to verify persistence
    const reloaded = loadProjectConfig(tmp);
    assert.ok(reloaded);
    assert.equal(reloaded.config.tunnel?.port, 3000);
    assert.equal(reloaded.config.deploy?.name, "app-1");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("project config supports preDeploy in explita.json", () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-config-predeploy-"));
  try {
    const configContent = JSON.stringify({
      deploy: {
        name: "migrated-app",
        preDeploy: "npx prisma migrate deploy",
      },
    });
    writeFileSync(join(tmp, "explita.json"), configContent, "utf8");

    const loaded = loadProjectConfig(tmp);
    assert.ok(loaded);
    assert.equal(loaded.config.deploy?.name, "migrated-app");
    assert.equal(loaded.config.deploy?.preDeploy, "npx prisma migrate deploy");

    // Save update with another preDeploy hook
    const saved = saveProjectConfig(
      { deploy: { preDeploy: "npm run migrate" } },
      tmp,
    );
    assert.equal(saved.config.deploy?.preDeploy, "npm run migrate");

    const reloaded = loadProjectConfig(tmp);
    assert.ok(reloaded);
    assert.equal(reloaded.config.deploy?.preDeploy, "npm run migrate");
    assert.equal(reloaded.config.deploy?.name, "migrated-app");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("project config supports multi preDeploy array in explita.json", () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-config-multi-test-"));
  try {
    const configContent = JSON.stringify({
      deploy: {
        name: "multi-hook-app",
        preDeploy: ["npx prisma migrate deploy", "npm run seed"],
      },
    });
    writeFileSync(join(tmp, "explita.json"), configContent, "utf8");

    const loaded = loadProjectConfig(tmp);
    assert.ok(loaded);
    assert.deepEqual(loaded.config.deploy?.preDeploy, [
      "npx prisma migrate deploy",
      "npm run seed",
    ]);

    const saved = saveProjectConfig(
      {
        deploy: {
          preDeploy: [
            "npx prisma migrate deploy",
            "npm run seed",
            "npm run warmup",
          ],
        },
      },
      tmp,
    );
    assert.deepEqual(saved.config.deploy?.preDeploy, [
      "npx prisma migrate deploy",
      "npm run seed",
      "npm run warmup",
    ]);

    const reloaded = loadProjectConfig(tmp);
    assert.ok(reloaded);
    assert.deepEqual(reloaded.config.deploy?.preDeploy, [
      "npx prisma migrate deploy",
      "npm run seed",
      "npm run warmup",
    ]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("normalizeHealthCheck resolves string, boolean, object, and disabled inputs", () => {
  assert.equal(normalizeHealthCheck(undefined), null);
  assert.equal(normalizeHealthCheck(null), null);
  assert.equal(normalizeHealthCheck(false), null);
  assert.equal(normalizeHealthCheck(""), null);
  assert.equal(normalizeHealthCheck(true), "/");
  assert.equal(normalizeHealthCheck("health"), "/health");
  assert.equal(normalizeHealthCheck("/api/health"), "/api/health");
  assert.equal(normalizeHealthCheck({ path: "ping" }), "/ping");
});

test("project config supports healthCheck in explita.json", () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-config-health-test-"));
  try {
    const configContent = JSON.stringify({
      deploy: {
        name: "health-app",
        healthCheck: "/health",
      },
    });
    writeFileSync(join(tmp, "explita.json"), configContent, "utf8");

    const loaded = loadProjectConfig(tmp);
    assert.ok(loaded);
    assert.equal(loaded.config.deploy?.healthCheck, "/health");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("normalizeDomains parses single, array, and comma-separated inputs", () => {
  assert.deepEqual(normalizeDomains(undefined), []);
  assert.deepEqual(normalizeDomains(null), []);
  assert.deepEqual(normalizeDomains(""), []);
  assert.deepEqual(normalizeDomains("app.example.com"), ["app.example.com"]);
  assert.deepEqual(normalizeDomains("app.example.com, api.example.com"), [
    "app.example.com",
    "api.example.com",
  ]);
  assert.deepEqual(
    normalizeDomains([
      "app.example.com",
      "api.example.com, staging.example.com",
    ]),
    ["app.example.com", "api.example.com", "staging.example.com"],
  );
});

test("saveProjectConfig supports replaceDeploy and replaceTunnel options", () => {
  const tmp = mkdtempSync(join(tmpdir(), "explita-config-replace-test-"));
  try {
    saveProjectConfig(
      {
        deploy: { name: "initial-name", port: 3000, domains: ["initial.com"] },
        tunnel: { port: 3000, subdomain: "initial-tunnel" },
      },
      tmp,
    );

    // Default save merges
    const merged = saveProjectConfig({ deploy: { port: 8080 } }, tmp);
    assert.equal(merged.config.deploy?.name, "initial-name");
    assert.equal(merged.config.deploy?.port, 8080);
    assert.deepEqual(merged.config.deploy?.domains, ["initial.com"]);

    // With replaceDeploy: true
    const replaced = saveProjectConfig(
      { deploy: { name: "new-only", port: 4000 } },
      tmp,
      { replaceDeploy: true },
    );
    assert.equal(replaced.config.deploy?.name, "new-only");
    assert.equal(replaced.config.deploy?.port, 4000);
    assert.equal(replaced.config.deploy?.domains, undefined);
    // Tunnel section is preserved
    assert.equal(replaced.config.tunnel?.subdomain, "initial-tunnel");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
