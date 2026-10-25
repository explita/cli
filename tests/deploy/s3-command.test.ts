import test from "node:test";
import assert from "node:assert/strict";
import { parseAppCommand } from "../../src/deploy/lib/resolve-app.js";

test("eda s3 status parses optional appId", () => {
  const explicit = parseAppCommand(
    ["-a", "my-app"],
    "s3 status",
    {},
    { optional: true },
  );
  assert.equal(explicit.appId, "my-app");

  const global = parseAppCommand([], "s3 status", {}, { optional: true });
  assert.equal(global.appId, undefined);
});

test("eda s3 set parses all S3 options", () => {
  const { appId, values } = parseAppCommand(
    [
      "-a",
      "test-app",
      "--bucket",
      "my-bucket",
      "--access-key",
      "AKIAIOSFODNN7EXAMPLE",
      "--secret-key",
      "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      "--endpoint",
      "https://example.r2.cloudflarestorage.com",
      "--region",
      "auto",
      "--prefix",
      "custom-backups",
      "--force-path-style",
      "--disable",
    ],
    "s3 set",
    {
      bucket: { type: "string" },
      "access-key": { type: "string" },
      "secret-key": { type: "string" },
      endpoint: { type: "string" },
      region: { type: "string" },
      prefix: { type: "string" },
      "force-path-style": { type: "boolean" },
      disable: { type: "boolean" },
    },
  );

  assert.equal(appId, "test-app");
  assert.equal(values.bucket, "my-bucket");
  assert.equal(values["access-key"], "AKIAIOSFODNN7EXAMPLE");
  assert.equal(values["secret-key"], "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
  assert.equal(values.endpoint, "https://example.r2.cloudflarestorage.com");
  assert.equal(values.region, "auto");
  assert.equal(values.prefix, "custom-backups");
  assert.equal(values["force-path-style"], true);
  assert.equal(values.disable, true);
});

test("eda s3 test parses optional appId", () => {
  const testWithApp = parseAppCommand(
    ["-a", "my-app"],
    "s3 test",
    {},
    { optional: true },
  );
  assert.equal(testWithApp.appId, "my-app");

  const testGlobal = parseAppCommand([], "s3 test", {}, { optional: true });
  assert.equal(testGlobal.appId, undefined);
});

test("eda s3 rm requires appId", () => {
  const rmParsed = parseAppCommand(["-a", "my-app"], "s3 rm", {});
  assert.equal(rmParsed.appId, "my-app");
});
