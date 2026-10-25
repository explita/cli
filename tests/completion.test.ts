import test from "node:test";
import assert from "node:assert/strict";
import {
  generateBashCompletion,
  generateZshCompletion,
  generatePwshCompletion,
  runCompletionCommand,
  COMPLETION_TREE,
} from "../src/lib/completion/index.js";

test("COMPLETION_TREE contains core eda commands", () => {
  assert.ok(COMPLETION_TREE.init);
  assert.ok(COMPLETION_TREE.domain);
  assert.ok(COMPLETION_TREE.s3);
  assert.ok(COMPLETION_TREE.db);
  assert.ok(COMPLETION_TREE.completion);
  assert.ok(COMPLETION_TREE.doctor);
  assert.ok(COMPLETION_TREE.logs);
  assert.ok(COMPLETION_TREE.stats);

  // Check subcommands exist
  assert.ok(COMPLETION_TREE.s3.subcommands?.set);
  assert.ok(COMPLETION_TREE.db.subcommands?.backup);
  assert.ok(COMPLETION_TREE.completion.subcommands?.bash);
  assert.ok(COMPLETION_TREE.completion.subcommands?.zsh);
  assert.ok(COMPLETION_TREE.completion.subcommands?.pwsh);
});

test("generateBashCompletion outputs valid bash completion script", () => {
  const bashScript = generateBashCompletion();

  assert.ok(bashScript.includes("# bash completion for eda / explita"));
  assert.ok(bashScript.includes("_eda_completions()"));
  assert.ok(bashScript.includes("complete -F _eda_completions eda"));
  assert.ok(bashScript.includes("complete -F _eda_completions explita"));
  assert.ok(bashScript.includes("--pass"));
  assert.ok(bashScript.includes("--otp"));
  assert.ok(bashScript.includes("completion"));
});

test("generateZshCompletion outputs valid zsh completion script", () => {
  const zshScript = generateZshCompletion();

  assert.ok(zshScript.includes("#compdef eda explita"));
  assert.ok(zshScript.includes("_eda()"));
  assert.ok(zshScript.includes("_describe 'command' top_commands"));
  assert.ok(zshScript.includes("--pass:Passcode / PIN for server authentication"));
  assert.ok(zshScript.includes("--otp:6-digit TOTP 2FA code"));
});

test("generatePwshCompletion outputs valid PowerShell completion script", () => {
  const pwshScript = generatePwshCompletion();

  assert.ok(pwshScript.includes("# PowerShell completion for eda / explita"));
  assert.ok(pwshScript.includes("Register-ArgumentCompleter -Native -CommandName 'eda', 'explita'"));
  assert.ok(pwshScript.includes("$edaCompletionTree = @'"));
  assert.ok(pwshScript.includes("$edaGlobalFlags = @'"));
  assert.ok(pwshScript.includes("[System.Management.Automation.CompletionResult]::new"));
});

test("runCompletionCommand writes completion scripts to stdout", async () => {
  const originalWrite = process.stdout.write;
  let stdoutData = "";

  process.stdout.write = ((chunk: any) => {
    stdoutData += chunk.toString();
    return true;
  }) as any;

  try {
    stdoutData = "";
    await runCompletionCommand(["bash"]);
    assert.ok(stdoutData.includes("_eda_completions"));

    stdoutData = "";
    await runCompletionCommand(["zsh"]);
    assert.ok(stdoutData.includes("#compdef eda explita"));

    stdoutData = "";
    await runCompletionCommand(["pwsh"]);
    assert.ok(stdoutData.includes("Register-ArgumentCompleter"));

    stdoutData = "";
    await runCompletionCommand(["--help"]);
    assert.ok(stdoutData.includes("Shell Completion"));
  } finally {
    process.stdout.write = originalWrite;
  }
});

test("runCompletionCommand rejects unknown shells", async () => {
  await assert.rejects(
    async () => {
      await runCompletionCommand(["fish"]);
    },
    {
      name: "Error",
      message: /Unsupported shell "fish"/,
    },
  );
});
