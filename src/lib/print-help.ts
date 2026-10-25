import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { CLI_VERSION } from "../version.js";
import { printCmdAndDec } from "./utils.js";

export function printHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.cli} v${CLI_VERSION}`,
    desc: "Unified developer infrastructure CLI",
    usage: "explita <command> [options]",
    commands: [
      [
        `${colors.cyan("init")} [options]`,
        "Initialize project config (explita.json with $schema)",
      ],
      [
        `${colors.cyan("deploy")} (or ${colors.cyan("eda")}) [cmd]`,
        "Deploy and manage applications on your infrastructure",
      ],
      [
        `${colors.cyan("tunnel")} (or ${colors.cyan("eta")}) [cmd]`,
        "Manage and run reverse tunnels and tokens",
      ],
      [
        `${colors.cyan("config")} [command]`,
        "Manage global unified configuration",
      ],
      [
        `${colors.cyan("completion")} <bash|zsh|pwsh>`,
        "Generate shell tab-completion script",
      ],
    ],
    options: [
      ["-h, --help", "Show help"],
      ["-v, --version", "Show version"],
    ],
    footerNote: `Run "explita <command> --help" for more details on each command.`,
  });
}
