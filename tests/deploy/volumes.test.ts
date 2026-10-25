import test from "node:test";
import assert from "node:assert/strict";
import { normalizeVolumes, parseVolumeBinding } from "@explita/infra-protocol";

test("parseVolumeBinding parses standard named volume", () => {
  const result = parseVolumeBinding("uploads:/app/uploads");
  assert.deepEqual(result, {
    host: "uploads",
    container: "/app/uploads",
    mode: undefined,
  });
});

test("parseVolumeBinding parses host directory mount with mode", () => {
  const result = parseVolumeBinding("/var/data:/data:ro");
  assert.deepEqual(result, {
    host: "/var/data",
    container: "/data",
    mode: "ro",
  });
});

test("parseVolumeBinding parses Windows path with drive letter", () => {
  const result = parseVolumeBinding("C:\\Users\\app\\data:/app/data");
  assert.deepEqual(result, {
    host: "C:\\Users\\app\\data",
    container: "/app/data",
    mode: undefined,
  });
});

test("normalizeVolumes handles undefined and null", () => {
  assert.equal(normalizeVolumes(undefined), undefined);
  assert.equal(normalizeVolumes(null), null);
  assert.equal(normalizeVolumes(false), null);
});

test("normalizeVolumes normalizes array of strings", () => {
  const normalized = normalizeVolumes([
    "uploads:/app/uploads",
    "/var/data:/app/data:ro",
  ]);
  assert.deepEqual(normalized, {
    uploads: "/app/uploads",
    "/var/data": "/app/data:ro",
  });
});

test("normalizeVolumes normalizes record object", () => {
  const normalized = normalizeVolumes({
    uploads: "/app/uploads",
    "/var/data": "/app/data",
  });
  assert.deepEqual(normalized, {
    uploads: "/app/uploads",
    "/var/data": "/app/data",
  });
});

test("normalizeVolumes normalizes array of host/container objects", () => {
  const normalized = normalizeVolumes([
    { host: "my_vol", container: "/var/log", mode: "rw" },
    { source: "/etc/ssl", target: "/ssl", mode: "ro" },
  ]);
  assert.deepEqual(normalized, {
    my_vol: "/var/log:rw",
    "/etc/ssl": "/ssl:ro",
  });
});

test("normalizeVolumes parses stringified JSON", () => {
  const normalized = normalizeVolumes('["uploads:/app/uploads"]');
  assert.deepEqual(normalized, {
    uploads: "/app/uploads",
  });
});
