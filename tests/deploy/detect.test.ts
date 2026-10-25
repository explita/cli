import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProjectPort, detectProjectName } from "../../src/deploy/lib/detect.js";

function withTempDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "explita-detect-test-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("detectProjectPort detects port from Next.js package.json -p flag", () => {
  withTempDir((dir) => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "my-next-app",
        scripts: {
          start: "next start -p 4000",
        },
      }),
    );
    const port = detectProjectPort(dir);
    assert.equal(port, 4000);
  });
});

test("detectProjectPort detects port from package.json PORT=env prefix", () => {
  withTempDir((dir) => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: {
          start: "PORT=8080 node server.js",
        },
      }),
    );
    const port = detectProjectPort(dir);
    assert.equal(port, 8080);
  });
});

test("detectProjectPort detects port from Dockerfile EXPOSE", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "Dockerfile"), "FROM node:20\nEXPOSE 5000\n");
    const port = detectProjectPort(dir);
    assert.equal(port, 5000);
  });
});

test("detectProjectPort detects port from Dockerfile ENV PORT", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "Dockerfile"), "FROM node:20\nENV PORT 4000\n");
    const port = detectProjectPort(dir);
    assert.equal(port, 4000);
  });
});

test("detectProjectPort detects port from lowercase dockerfile", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "dockerfile"), "FROM node:20\nENV PORT=4200\n");
    const port = detectProjectPort(dir);
    assert.equal(port, 4200);
  });
});

test("detectProjectPort prioritizes custom port over default 3000", () => {
  withTempDir((dir) => {
    writeFileSync(join(dir, "Dockerfile"), "FROM node:20\nEXPOSE 3000\n");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: {
          start: "next start -p 4000",
        },
      }),
    );
    const port = detectProjectPort(dir);
    assert.equal(port, 4000);
  });
});

test("detectProjectPort returns undefined when no port is declared", () => {
  withTempDir((dir) => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "test-app",
        scripts: {
          start: "node index.js",
        },
      }),
    );
    const port = detectProjectPort(dir);
    assert.equal(port, undefined);
  });
});

test("detectProjectName resolves package.json name or directory name", () => {
  withTempDir((dir) => {
    assert.ok(detectProjectName(dir).startsWith("explita-detect-test-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "my-awesome-app" }),
    );
    assert.equal(detectProjectName(dir), "my-awesome-app");
  });
});
