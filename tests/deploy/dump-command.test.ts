import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "node:util";

function parseDumpArgs(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      help: { type: "boolean", short: "h" },
      app: { type: "string", short: "a" },
      all: { type: "boolean", short: "A" },
      db: { type: "boolean", short: "d" },
      files: { type: "boolean", short: "f" },
      env: { type: "boolean", short: "e" },
      "reveal-secrets": { type: "boolean", short: "s" },
      s3: { type: "boolean" },
      output: { type: "string", short: "o" },
    },
    allowPositionals: true,
  });

  const isAll = Boolean(values.all);
  const targetAppId = isAll ? undefined : values.app?.trim() || undefined;

  const hasComponentFilter = Boolean(values.db || values.files || values.env);
  const includeDb = hasComponentFilter ? Boolean(values.db) : true;
  const includeFiles = hasComponentFilter ? Boolean(values.files) : true;
  const includeEnv = hasComponentFilter ? Boolean(values.env) : true;
  const revealSecrets = Boolean(values["reveal-secrets"]);
  const s3 = Boolean(values.s3);
  const output = (values.output as string) || undefined;

  return {
    targetAppId,
    includeDb,
    includeFiles,
    includeEnv,
    revealSecrets,
    s3,
    output,
  };
}

test("dump defaults to system scope and all components when no flags are passed", () => {
  const parsed = parseDumpArgs([]);
  assert.equal(parsed.targetAppId, undefined);
  assert.equal(parsed.includeDb, true);
  assert.equal(parsed.includeFiles, true);
  assert.equal(parsed.includeEnv, true);
  assert.equal(parsed.revealSecrets, false);
  assert.equal(parsed.s3, false);
});

test("dump targets single app when -a is provided", () => {
  const parsed = parseDumpArgs(["-a", "web-service"]);
  assert.equal(parsed.targetAppId, "web-service");
  assert.equal(parsed.includeDb, true);
  assert.equal(parsed.includeFiles, true);
  assert.equal(parsed.includeEnv, true);
});

test("dump selectively filters components when -d, -f, or -e are passed", () => {
  const dbOnly = parseDumpArgs(["-a", "my-app", "-d"]);
  assert.equal(dbOnly.targetAppId, "my-app");
  assert.equal(dbOnly.includeDb, true);
  assert.equal(dbOnly.includeFiles, false);
  assert.equal(dbOnly.includeEnv, false);

  const dbAndFiles = parseDumpArgs(["-d", "-f"]);
  assert.equal(dbAndFiles.targetAppId, undefined);
  assert.equal(dbAndFiles.includeDb, true);
  assert.equal(dbAndFiles.includeFiles, true);
  assert.equal(dbAndFiles.includeEnv, false);
});

test("dump parses --reveal-secrets and -s flags", () => {
  const secret1 = parseDumpArgs(["--reveal-secrets"]);
  assert.equal(secret1.revealSecrets, true);

  const secret2 = parseDumpArgs(["-s"]);
  assert.equal(secret2.revealSecrets, true);
});

test("dump parses -o output destination flag", () => {
  const out = parseDumpArgs(["-a", "api", "-o", "custom-backup.tar.gz"]);
  assert.equal(out.output, "custom-backup.tar.gz");
});

test("dump parses --s3 flag", () => {
  const s3Dump = parseDumpArgs(["-a", "api", "--s3"]);
  assert.equal(s3Dump.s3, true);
});

