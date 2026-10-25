import test from "node:test";
import assert from "node:assert/strict";
import { formatDomainCheck } from "../../src/deploy/commands/domain.js";
import type { DomainCheckResult } from "@explita/infra-protocol/deploy";

test("formatDomainCheck renders verified status with A record", () => {
  const result: DomainCheckResult = {
    domain: "api.example.com",
    serverIp: "198.51.100.4",
    dns: {
      status: "verified",
      aRecords: ["198.51.100.4"],
      cnameRecords: [],
      matchesServerIp: true,
      message: "DNS verified (points to 198.51.100.4).",
    },
    ssl: {
      status: "active",
      hasCertificate: true,
      message: "Active certificate provisioned by Let's Encrypt.",
    },
  };

  const output = formatDomainCheck(result);
  assert.match(output, /api\.example\.com/);
  assert.match(output, /198\.51\.100\.4/);
  assert.match(output, /DNS verified/);
  assert.match(output, /Let's Encrypt/);
});

test("formatDomainCheck renders mismatch warning with action advice", () => {
  const result: DomainCheckResult = {
    domain: "staging.example.com",
    serverIp: "198.51.100.4",
    dns: {
      status: "mismatch",
      aRecords: ["1.2.3.4"],
      cnameRecords: [],
      matchesServerIp: false,
      message: "Domain points to 1.2.3.4 (expected 198.51.100.4).",
    },
    ssl: {
      status: "pending",
      hasCertificate: false,
      message: "Pending Caddy automated issuance.",
    },
  };

  const output = formatDomainCheck(result);
  assert.match(output, /staging\.example\.com/);
  assert.match(output, /1\.2\.3\.4/);
  assert.match(output, /Update your DNS/);
  assert.match(output, /Pending DNS resolution/);
});

test("formatDomainCheck renders unresolved status with instructions", () => {
  const result: DomainCheckResult = {
    domain: "new.example.com",
    serverIp: "198.51.100.4",
    dns: {
      status: "unresolved",
      aRecords: [],
      cnameRecords: [],
      matchesServerIp: false,
      message: 'No A or CNAME records found for "new.example.com".',
    },
    ssl: {
      status: "pending",
      hasCertificate: false,
      message: "No certificate provisioned yet.",
    },
  };

  const output = formatDomainCheck(result);
  assert.match(output, /new\.example\.com/);
  assert.match(output, /No A or CNAME records found/);
  assert.match(output, /Add an A record/);
});
