import { generateBashCompletion } from "./bash.js";
import { generateZshCompletion } from "./zsh.js";
import { generatePwshCompletion } from "./pwsh.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../utils.js";

export * from "./tree.js";
export * from "./bash.js";
export * from "./zsh.js";
export * from "./pwsh.js";

function printCompletionHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Shell Completion`,
    desc: "Generate auto-completion scripts for Bash, Zsh, and PowerShell (pwsh)",
    commands: [
      ["eda completion bash", "Generate Bash completion script"],
      ["eda completion zsh", "Generate Zsh completion script"],
      ["eda completion pwsh", "Generate PowerShell (pwsh) completion script"],
    ],
    examples: [
      [
        'eval "$(eda completion bash)"',
        "Enable completion in current Bash session",
      ],
      [
        "eda completion bash > ~/.local/share/bash-completion/completions/eda",
        "Install permanent Bash completion",
      ],
      [
        'eval "$(eda completion zsh)"',
        "Enable completion in current Zsh session",
      ],
      [
        "eda completion zsh > ~/.zsh/completion/_eda",
        "Install permanent Zsh completion",
      ],
      [
        "eda completion pwsh | Out-String | Invoke-Expression",
        "Enable completion in current PowerShell session",
      ],
      [
        "eda completion pwsh >> $PROFILE",
        "Install permanent PowerShell completion into your profile",
      ],
    ],
    options: [["-h, --help", "Show help"]],
  });
}

export async function runCompletionCommand(args: string[]): Promise<void> {
  const shell = args[0]?.toLowerCase();

  switch (shell) {
    case "bash":
      process.stdout.write(generateBashCompletion());
      break;
    case "zsh":
      process.stdout.write(generateZshCompletion());
      break;
    case "pwsh":
    case "powershell":
      process.stdout.write(generatePwshCompletion());
      break;
    case "--help":
    case "-h":
    case undefined:
      printCompletionHelp();
      break;
    default:
      printCompletionHelp();
      throw new Error(
        `Unsupported shell "${shell}". Supported shells: bash, zsh, pwsh.`,
      );
  }
}
