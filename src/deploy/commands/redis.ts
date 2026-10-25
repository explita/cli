import { api } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

function printRedisHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Redis`,
    desc: "Managed Redis databases for caching, queues & sessions",
    commands: [
      [
        "eda redis create [-a <appId>]",
        "Provision isolated Redis database index for application",
      ],
      ["eda redis url [-a <appId>]", "View connection string (REDIS_URL)"],
      [
        "eda redis rm -a <appId>",
        "Flush database index and remove configuration",
      ],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (or auto-resolved from explita.json)",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

export async function runRedisCommand(args: string[]): Promise<void> {
  const subCommand = args[0]?.toLowerCase();

  switch (subCommand) {
    case "--help":
    case "-h":
    case undefined: {
      printRedisHelp();
      return;
    }

    case "create": {
      await runRedisCreate(args);
      break;
    }

    case "url": {
      const { appId } = parseAppCommand(args.slice(1), "redis url");

      const result = await api<{
        appId: string;
        dbIndex: number;
        url: string;
        createdAt?: string;
      }>(`/api/apps/${encodeURIComponent(appId)}/redis`);

      console.log(`\n${colors.bold("REDIS_URL")}:`);
      console.log(`  ${colors.green(result.url)}`);
      console.log(`  Database Index: ${colors.cyan(String(result.dbIndex))}\n`);
      break;
    }

    case "rm":
    case "delete":
    case "destroy": {
      const { appId } = parseAppCommand(args.slice(1), "redis rm");

      await api<{ success: boolean; message: string }>(
        `/api/apps/${encodeURIComponent(appId)}/redis`,
        { method: "DELETE" },
      );

      console.log(
        `\n${colors.green("✔")} Redis database successfully removed and flushed for application ${colors.cyan(appId)}.\n`,
      );
      break;
    }

    default: {
      console.error(
        `${colors.red("Error:")} Unknown redis subcommand "${subCommand}".\nRun ${colors.cyan("eda redis --help")} for usage.`,
      );
      process.exit(1);
    }
  }
}

async function runRedisCreate(args: string[]) {
  const { appId } = parseAppCommand(args.slice(1), "redis create");

  const result = await api<{
    appId: string;
    dbIndex: number;
    url: string;
  }>(`/api/apps/${encodeURIComponent(appId)}/redis`, {
    method: "POST",
  });

  console.log(
    `\n${colors.green("✔")} Redis database successfully provisioned for application ${colors.cyan(appId)}!\n`,
  );
  console.log(`  Database Index : ${colors.cyan(String(result.dbIndex))}`);
  console.log(`  REDIS_URL      : ${colors.bold(colors.green(result.url))}\n`);
  console.log(
    `  ${colors.dim("The REDIS_URL will be automatically injected into your app container on next deployment.")}\n`,
  );
}
