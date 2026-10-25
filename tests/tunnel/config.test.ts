import test from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs } from "../../src/tunnel/lib/args.js";
import { TunnelAgent } from "../../src/tunnel/core/agent.js";

test("parseCliArgs with --allow-ip single", () => {
  const config = parseCliArgs(["3000", "--allow-ip", "192.168.1.100"]);
  assert.equal(config.port, 3000);
  assert.deepEqual(config.allowedIps, ["192.168.1.100"]);
});

test("parseCliArgs with -i CIDR comma-separated", () => {
  const config = parseCliArgs(["8080", "-i", "10.0.0.0/8, 192.168.1.0/24"]);
  assert.equal(config.port, 8080);
  assert.deepEqual(config.allowedIps, ["10.0.0.0/8", "192.168.1.0/24"]);
});

test("parseCliArgs default inspector behavior", () => {
  const config = parseCliArgs(["3000"]);
  assert.equal(config.port, 3000);
  assert.equal(config.allowedIps, undefined);
  assert.equal(config.inspect, true);
  assert.equal(config.inspectUi, true);
  assert.equal(config.inspectPort, undefined);
});

test("parseCliArgs with --inspect flag only (default port)", () => {
  const config = parseCliArgs(["3000", "--inspect"]);
  assert.equal(config.port, 3000);
  assert.equal(config.inspect, true);
  assert.equal(config.inspectUi, true);
  assert.equal(config.inspectPort, undefined);
});

test("parseCliArgs with --inspect followed by port", () => {
  const config = parseCliArgs(["3000", "--inspect", "5000"]);
  assert.equal(config.port, 3000);
  assert.equal(config.inspect, 5000);
  assert.equal(config.inspectUi, true);
  assert.equal(config.inspectPort, 5000);
});

test("parseCliArgs with --inspect=port syntax", () => {
  const config = parseCliArgs(["3000", "--inspect=5000"]);
  assert.equal(config.port, 3000);
  assert.equal(config.inspect, 5000);
  assert.equal(config.inspectUi, true);
  assert.equal(config.inspectPort, 5000);
});

test("parseCliArgs with --no-inspect flag", () => {
  const config = parseCliArgs(["3000", "--no-inspect"]);
  assert.equal(config.port, 3000);
  assert.equal(config.inspect, false);
  assert.equal(config.inspectUi, false);
});

test("parseCliArgs with --inspect 9000", () => {
  const config = parseCliArgs(["3000", "--inspect", "9000"]);
  assert.equal(config.port, 3000);
  assert.equal(config.inspect, 9000);
  assert.equal(config.inspectUi, true);
  assert.equal(config.inspectPort, 9000);
});

test("parseCliArgs with --inspect=false", () => {
  const config = parseCliArgs(["3000", "--inspect=false"]);
  assert.equal(config.port, 3000);
  assert.equal(config.inspect, false);
  assert.equal(config.inspectUi, false);
  assert.equal(config.inspectPort, undefined);
});

test("parseCliArgs with --inspect false", () => {
  const config = parseCliArgs(["3000", "--inspect", "false"]);
  assert.equal(config.port, 3000);
  assert.equal(config.inspect, false);
  assert.equal(config.inspectUi, false);
  assert.equal(config.inspectPort, undefined);
});

test("parseCliArgs with --inspect=true", () => {
  const config = parseCliArgs(["3000", "--inspect=true"]);
  assert.equal(config.port, 3000);
  assert.equal(config.inspect, true);
  assert.equal(config.inspectUi, true);
  assert.equal(config.inspectPort, undefined);
});

test("parseCliArgs with --inspect true", () => {
  const config = parseCliArgs(["3000", "--inspect", "true"]);
  assert.equal(config.port, 3000);
  assert.equal(config.inspect, true);
  assert.equal(config.inspectUi, true);
  assert.equal(config.inspectPort, undefined);
});

test("parseCliArgs with --host-header flag default (rewrite)", () => {
  const config = parseCliArgs(["3000", "--host-header"]);
  assert.equal(config.port, 3000);
  assert.equal(config.hostHeader, "rewrite");
});

test("parseCliArgs with -H flag default (rewrite)", () => {
  const config = parseCliArgs(["3000", "-H"]);
  assert.equal(config.port, 3000);
  assert.equal(config.hostHeader, "rewrite");
});

test("parseCliArgs with --host-header followed by custom host", () => {
  const config = parseCliArgs(["3000", "--host-header", "example.com"]);
  assert.equal(config.port, 3000);
  assert.equal(config.hostHeader, "example.com");
});

test("parseCliArgs with --host-header=custom host syntax", () => {
  const config = parseCliArgs(["3000", "--host-header=my-app.local"]);
  assert.equal(config.port, 3000);
  assert.equal(config.hostHeader, "my-app.local");
});

test("parseCliArgs with --host-header localhost maps to rewrite", () => {
  const config = parseCliArgs(["3000", "--host-header", "localhost"]);
  assert.equal(config.port, 3000);
  assert.equal(config.hostHeader, "rewrite");
});

test("parseCliArgs with --host", () => {
  const config = parseCliArgs(["3000", "--host", "explita-app-1"]);
  assert.equal(config.port, 3000);
  assert.equal(config.host, "explita-app-1");
});

test("parseCliArgs with --target", () => {
  const config = parseCliArgs(["3000", "--target", "http://172.18.0.5:8080"]);
  assert.equal(config.port, 3000);
  assert.equal(config.target, "http://172.18.0.5:8080");
});

test("TunnelAgent programmatic instantiation with minimal config", () => {
  const agent = new TunnelAgent({
    port: 3000,
    host: "explita-app-1",
  });
  assert.ok(agent);
  assert.equal(typeof agent.start, "function");
  assert.equal(typeof agent.stop, "function");
});

