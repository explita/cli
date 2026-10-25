import test from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { askConfirm, askQuestion } from "../src/lib/prompt.js";

function createMockStream(inputs: string[]) {
  const readable = new Readable({
    read() {
      if (inputs.length > 0) {
        this.push(inputs.shift() + "\n");
      } else {
        this.push(null);
      }
    },
  });

  let outputText = "";
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      outputText += chunk.toString();
      callback();
    },
  });

  return { readable, writable, getOutput: () => outputText };
}

test("askQuestion reads and trims user input", async () => {
  const { readable, writable, getOutput } = createMockStream(["  hello world  "]);
  const answer = await askQuestion("Enter name: ", { input: readable, output: writable });

  assert.equal(answer, "hello world");
  assert.ok(getOutput().includes("Enter name: "));
});

test("askConfirm defaults to false with [y/N] on empty input", async () => {
  const { readable, writable, getOutput } = createMockStream([""]);
  const confirmed = await askConfirm("Are you sure?", {
    defaultYes: false,
    input: readable,
    output: writable,
  });

  assert.equal(confirmed, false);
  assert.ok(getOutput().includes("[y/N]"));
});

test("askConfirm returns true for 'y' or 'yes'", async () => {
  const { readable: r1, writable: w1 } = createMockStream(["y"]);
  assert.equal(await askConfirm("Continue?", { input: r1, output: w1 }), true);

  const { readable: r2, writable: w2 } = createMockStream(["yes"]);
  assert.equal(await askConfirm("Continue?", { input: r2, output: w2 }), true);
});

test("askConfirm defaults to true with [Y/n] on empty input when defaultYes=true", async () => {
  const { readable, writable, getOutput } = createMockStream([""]);
  const confirmed = await askConfirm("Proceed?", {
    defaultYes: true,
    input: readable,
    output: writable,
  });

  assert.equal(confirmed, true);
  assert.ok(getOutput().includes("[Y/n]"));
});

test("askConfirm returns false for 'n' or 'no' even when defaultYes=true", async () => {
  const { readable: r1, writable: w1 } = createMockStream(["n"]);
  assert.equal(await askConfirm("Proceed?", { defaultYes: true, input: r1, output: w1 }), false);

  const { readable: r2, writable: w2 } = createMockStream(["no"]);
  assert.equal(await askConfirm("Proceed?", { defaultYes: true, input: r2, output: w2 }), false);
});

test("askConfirm preserves already-bracketed prompts", async () => {
  const { readable, writable, getOutput } = createMockStream(["y"]);
  await askConfirm("Delete everything? [y/N] ", { input: readable, output: writable });

  const output = getOutput();
  assert.ok(output.includes("Delete everything? [y/N]"));
  // Does not duplicate [y/N]
  assert.equal((output.match(/\[y\/N\]/g) || []).length, 1);
});
