import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import {
  buildIgnoreMatcher,
  createTarball,
  computeSourceHash,
  shouldIgnore,
} from "../../src/deploy/lib/archive.js";

test("shouldIgnore catches default ignored patterns and tgz files", () => {
  assert.equal(shouldIgnore("node_modules/foo/bar.js"), true);
  assert.equal(shouldIgnore(".git/HEAD"), true);
  assert.equal(shouldIgnore(".env"), true);
  assert.equal(shouldIgnore(".env.local"), true);
  assert.equal(shouldIgnore("explita-cli-0.1.0.tgz"), true);
  assert.equal(shouldIgnore("archive.tar.gz"), true);
  assert.equal(shouldIgnore("src/index.ts"), false);
});

test("buildIgnoreMatcher respects .gitignore and .dockerignore", () => {
  const dir = mkdtempSync(join(tmpdir(), "explita-archive-test-"));
  try {
    writeFileSync(
      join(dir, ".gitignore"),
      `# test comment
*.secret
ignored-folder/
temp.log
explita.json
`,
      "utf8",
    );

    writeFileSync(
      join(dir, ".dockerignore"),
      `docker-only.txt
!allowed.secret
`,
      "utf8",
    );

    const isIgnored = buildIgnoreMatcher(dir);

    // Default ignores
    assert.equal(isIgnored("node_modules", true), true);
    assert.equal(isIgnored(".git", true), true);
    assert.equal(isIgnored("bundle.tgz", false), true);

    // .gitignore rules
    assert.equal(isIgnored("foo.secret", false), true);
    assert.equal(isIgnored("ignored-folder", true), true);
    assert.equal(isIgnored("temp.log", false), true);
    assert.equal(isIgnored("src/app.ts", false), false);

    // explita.json and Dockerfile are NEVER ignored even if listed in .dockerignore / .gitignore
    assert.equal(isIgnored("explita.json", false), false);
    assert.equal(isIgnored("Dockerfile", false), false);
    assert.equal(isIgnored("dockerfile", false), false);

    // .dockerignore rule
    assert.equal(isIgnored("docker-only.txt", false), true);

    // .dockerignore override (!allowed.secret un-ignores allowed.secret)
    assert.equal(isIgnored("allowed.secret", false), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("createTarball archives allowed files and omits ignored files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explita-tar-test-"));
  try {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "test-app" }),
    );
    writeFileSync(join(dir, ".gitignore"), "ignored.txt\n*.local.js\n");
    writeFileSync(join(dir, "ignored.txt"), "secret data");
    writeFileSync(join(dir, "config.local.js"), "local config");
    writeFileSync(join(dir, "keep.js"), "console.log('hello');");
    writeFileSync(join(dir, "archive.tgz"), "tarball content");

    const tarBuffer = await createTarball(dir);
    assert.ok(tarBuffer.length > 0, "Tarball buffer should not be empty");

    // Read back entries from tarball
    const entries: string[] = [];
    const extractDir = mkdtempSync(join(tmpdir(), "explita-tar-extract-"));
    try {
      await tar.x(
        {
          cwd: extractDir,
          onReadEntry: (entry) => {
            entries.push(entry.path.replace(/\\/g, "/"));
          },
        },
        [tarBuffer] as any,
      );
    } catch {
      // In node-tar, passing Buffer directly to tar.x is done via stream or write
      // Let's verify entries by parsing with tar.t
    }

    // Inspect entries using tar.t
    const inspectedEntries: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const parser = new tar.Parser();
      parser.on("entry", (entry) => {
        inspectedEntries.push(entry.path.replace(/\\/g, "/"));
        entry.resume();
      });
      parser.on("end", () => resolve());
      parser.on("error", reject);
      parser.end(tarBuffer);
    });

    assert.ok(inspectedEntries.some((p) => p.includes("package.json")));
    assert.ok(inspectedEntries.some((p) => p.includes("keep.js")));
    assert.ok(
      !inspectedEntries.some((p) => p.includes("ignored.txt")),
      "ignored.txt should be excluded",
    );
    assert.ok(
      !inspectedEntries.some((p) => p.includes("config.local.js")),
      "*.local.js should be excluded",
    );
    assert.ok(
      !inspectedEntries.some((p) => p.includes("archive.tgz")),
      "*.tgz should be excluded",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("computeSourceHash produces deterministic hash and ignores untracked files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "explita-hash-test-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app" }));
    writeFileSync(join(dir, "explita.json"), JSON.stringify({ deploy: { port: 3000 } }));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), "console.log('hello');");
    writeFileSync(join(dir, ".gitignore"), "ignored.log\nnode_modules/\n");
    writeFileSync(join(dir, "ignored.log"), "ignore this log");
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "dep.js"), "dep content");

    const hash1 = await computeSourceHash(dir);
    assert.equal(typeof hash1, "string");
    assert.equal(hash1.length, 64);

    // Re-computing without changes produces the exact same hash
    const hash2 = await computeSourceHash(dir);
    assert.equal(hash1, hash2, "Hash must be identical when files are unchanged");

    // Changing an ignored file does NOT change the source hash
    writeFileSync(join(dir, "ignored.log"), "modified ignored log");
    writeFileSync(join(dir, "node_modules", "dep.js"), "modified dep");
    const hash3 = await computeSourceHash(dir);
    assert.equal(hash1, hash3, "Modifying ignored files must not change hash");

    // Modifying a tracked source file DOES change the hash
    writeFileSync(join(dir, "src", "index.ts"), "console.log('updated');");
    const hash4 = await computeSourceHash(dir);
    assert.notEqual(hash1, hash4, "Modifying source file must change hash");

    // Modifying explita.json config DOES change the hash
    writeFileSync(join(dir, "explita.json"), JSON.stringify({ deploy: { port: 8080 } }));
    const hash5 = await computeSourceHash(dir);
    assert.notEqual(hash4, hash5, "Modifying explita.json must change hash");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
