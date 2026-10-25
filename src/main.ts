import { handleDeployCommand } from "./deploy/commands/deploy.js";
import { runTunnelCli } from "./tunnel/core/cli.js";
import { runGlobalConfigCommand } from "./lib/config-command.js";
import { runCompletionCommand } from "./lib/completion/index.js";
import { printHelp } from "./lib/print-help.js";
import { CLI_VERSION } from "./version.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";

export async function runExplitaCli(
  args: string[] = process.argv.slice(2),
): Promise<void> {
  const command = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  switch (command) {
    case undefined:
    case "--help":
    case "-h":
      printHelp();
      break;
    case "--version":
    case "-v":
      console.log(`${colors.bold(PRODUCT_NAME.cli)} v${CLI_VERSION}`);
      break;
    case "deploy":
    case "eda":
      await handleDeployCommand(subArgs);
      break;
    case "tunnel":
    case "eta":
      await runTunnelCli(subArgs);
      break;
    case "config":
      await runGlobalConfigCommand(subArgs);
      break;
    case "completion":
      await runCompletionCommand(subArgs);
      break;
    case "init":
      await handleDeployCommand(["init", ...subArgs]);
      break;
    default:
      printHelp();
      throw new Error(`Unknown command: ${command}`);
  }
}
