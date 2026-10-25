import test from "node:test";
import assert from "node:assert/strict";
import { formatStatsTable } from "../../src/deploy/commands/stats.js";
import type { ContainerStat } from "@explita/infra-protocol/deploy";

test("formatStatsTable handles empty container list", () => {
  const output = formatStatsTable([]);
  assert.match(output, /Collecting container metrics/);
});

test("formatStatsTable aligns columns and sorts roles correctly", () => {
  const stats: ContainerStat[] = [
    {
      container: "explita-caddy",
      id: "caddy123",
      name: "explita-caddy",
      cpuPerc: "0.15%",
      memUsage: "12.5MiB / 512MiB",
      memPerc: "2.44%",
      netIO: "1.2MB / 800kB",
      blockIO: "0B / 0B",
      pids: "8",
      role: "service",
    },
    {
      container: "explita-tunnel-app1",
      id: "tunnel123",
      name: "explita-tunnel-app1",
      cpuPerc: "0.02%",
      memUsage: "5.1MiB / 256MiB",
      memPerc: "1.99%",
      netIO: "500kB / 300kB",
      blockIO: "0B / 0B",
      pids: "4",
      role: "tunnel",
    },
    {
      container: "explita-app-app1-d-abc",
      id: "app123",
      name: "explita-app-app1-d-abc",
      cpuPerc: "1.25%",
      memUsage: "64.2MiB / 1GiB",
      memPerc: "6.27%",
      netIO: "15MB / 12MB",
      blockIO: "4kB / 0B",
      pids: "12",
      role: "app",
    },
  ];

  const table = formatStatsTable(stats);

  // Checks that headers are present
  assert.match(table, /CONTAINER/);
  assert.match(table, /ROLE/);
  assert.match(table, /CPU %/);
  assert.match(table, /MEM USAGE \/ LIMIT/);
  assert.match(table, /MEM %/);
  assert.match(table, /NET I\/O/);
  assert.match(table, /BLOCK I\/O/);
  assert.match(table, /PIDS/);

  // Verify that all 3 container names are present
  assert.match(table, /explita-app-app1-d-abc/);
  assert.match(table, /explita-tunnel-app1/);
  assert.match(table, /explita-caddy/);

  // App should come before tunnel, and tunnel before service
  const appIdx = table.indexOf("explita-app-app1-d-abc");
  const tunnelIdx = table.indexOf("explita-tunnel-app1");
  const caddyIdx = table.indexOf("explita-caddy");

  assert.ok(appIdx < tunnelIdx, "App should appear before tunnel");
  assert.ok(tunnelIdx < caddyIdx, "Tunnel should appear before service");
});
