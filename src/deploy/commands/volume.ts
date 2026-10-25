import { parseArgs } from "node:util";
import { api, handleFetchError, baseUrl } from "../lib/api.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";
import { askConfirm } from "../../lib/prompt.js";
import type {
  VolumeListResult,
  VolumeInspectResult,
  VolumeItem,
} from "@explita/infra-protocol/deploy";

function printVolumeHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Volume`,
    desc: "Inspect persistent Docker volumes and storage mounts",
    usage: "explita deploy volume <command> [options]",
    commands: [
      [
        "ls [-a <appId>]",
        "List persistent Docker volumes and mount bindings (default)",
      ],
      [
        "inspect <name>",
        "Show detailed volume configuration, disk size and container status",
      ],
      [
        "rm <name> [-y, --yes] [-f, --force]",
        "Permanently delete a persistent Docker volume (alias: delete)",
      ],
    ],
    examples: [
      ["eda volume", "List all Docker volumes across the system"],
      ["eda volume ls", "List all persistent Docker volumes"],
      [
        "eda volume ls -a my-app",
        "List volumes attached to a specific application",
      ],
      [
        "eda volume inspect app-uploads",
        "Inspect disk usage, mountpoint and container bindings",
      ],
      ["eda volume rm app-uploads", "Permanently remove an orphaned volume"],
      [
        "eda volume rm app-uploads -y",
        "Remove volume without confirmation prompt",
      ],
    ],
    options: [
      ["-a, --app <appId>", "Filter by target application ID"],
      ["-y, --yes", "Skip interactive deletion confirmation"],
      [
        "-f, --force",
        "Force deletion even if volume is registered in app configuration",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

export async function runVolumeCommand(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    printVolumeHelp();
    return;
  }

  const subCommand = args[0]?.toLowerCase();

  switch (subCommand) {
    case undefined:
    case "ls": {
      const rest = subCommand ? args.slice(1) : args;
      await runVolumeList(rest);
      break;
    }

    case "inspect": {
      await runVolumeInspect(args.slice(1));
      break;
    }

    case "rm": {
      await runVolumeRm(args.slice(1));
      break;
    }

    default: {
      // If the first argument starts with a flag (e.g. -a, --app), treat it as 'ls'
      if (subCommand.startsWith("-")) {
        await runVolumeList(args);
        return;
      }

      console.error(
        `${colors.red("Error:")} Unknown volume subcommand "${subCommand}".\nRun ${colors.cyan("eda volume --help")} for usage.`,
      );
      process.exit(1);
    }
  }
}

async function runVolumeList(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      app: { type: "string", short: "a" },
    },
    allowPositionals: true,
    strict: false,
  });

  const appId = typeof values.app === "string" ? values.app.trim() : undefined;

  const endpoint = appId
    ? `/api/volumes?app=${encodeURIComponent(appId)}`
    : "/api/volumes";

  try {
    const result = await api<VolumeItem[] | VolumeListResult>(endpoint);
    const volumes = Array.isArray(result) ? result : result.volumes || [];

    if (volumes.length === 0) {
      console.log(
        appId
          ? `\nNo persistent Docker volumes found for application "${colors.cyan(appId)}".\n`
          : "\nNo persistent Docker volumes found.\n",
      );
      return;
    }

    console.log(
      `\n${colors.bold("Docker Volumes")} (${appId ? `application: ${colors.cyan(appId)}` : "system-wide"}):\n`,
    );

    console.table(
      volumes.map((v) => ({
        "Volume Name": v.name,
        "App(s)":
          v.apps.length > 0
            ? v.apps.map((a) => `${a.appName} (${a.containerPath})`).join(", ")
            : "-",
        "In Use": v.inUse
          ? colors.green("✔ yes")
          : colors.dim("✖ no (detached)"),
        Containers: v.containers.join(", ") || "-",
        Size: v.size || "-",
        Driver: v.driver,
      })),
    );

    console.log(
      `${colors.dim(`Total: ${volumes.length} volume(s). Run 'eda volume inspect <name>' for full details.`)}\n`,
    );
  } catch (err) {
    throw handleFetchError(err, baseUrl());
  }
}

async function runVolumeInspect(args: string[]): Promise<void> {
  const { positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: false,
  });

  const volumeName = positionals[0]?.trim();
  if (!volumeName) {
    console.error(
      `${colors.red("Error:")} Missing volume name.\n\nUsage: eda volume inspect <name>\nExample: eda volume inspect app-uploads\n`,
    );
    process.exit(1);
  }

  try {
    const result = await api<VolumeInspectResult>(
      `/api/volumes/${encodeURIComponent(volumeName)}`,
    );

    console.log(
      `\n${colors.bold("Volume Details:")} ${colors.cyan(result.name)}\n`,
    );
    console.log(`  Driver     : ${colors.bold(result.driver)}`);
    console.log(`  Scope      : ${result.scope}`);
    if (result.mountpoint) {
      console.log(`  Mountpoint : ${colors.yellow(result.mountpoint)}`);
    }
    if (result.createdAt) {
      console.log(`  Created    : ${result.createdAt}`);
    }
    console.log(`  Disk Size  : ${colors.cyan(result.size || "Unknown")}`);

    const inUseDisplay = result.inUse
      ? `${colors.green("✔ Yes")}${result.containers.length > 0 ? ` (${result.containers.length} container(s))` : ""}`
      : colors.dim("✖ No (detached / orphaned)");
    console.log(`  In Use     : ${inUseDisplay}`);

    if (result.containers.length > 0) {
      console.log(
        `  Containers : ${colors.bold(result.containers.join(", "))}`,
      );
    }

    if (result.apps.length > 0) {
      console.log(`\n  ${colors.bold("Associated Application(s):")}`);
      for (const app of result.apps) {
        console.log(
          `    • ${colors.bold(app.appName)} (${colors.dim(app.appId)}) ➜ ${colors.cyan(app.containerPath)}`,
        );
      }
    } else {
      console.log(
        `\n  ${colors.dim("No Explita applications currently mount this volume.")}`,
      );
    }

    if (result.labels && Object.keys(result.labels).length > 0) {
      console.log(`\n  ${colors.bold("Labels:")}`);
      for (const [k, val] of Object.entries(result.labels)) {
        console.log(`    ${colors.dim(k)}: ${val}`);
      }
    }

    console.log("");
  } catch (err) {
    throw handleFetchError(err, baseUrl());
  }
}

async function runVolumeRm(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      yes: { type: "boolean", short: "y" },
      force: { type: "boolean", short: "f" },
    },
    allowPositionals: true,
    strict: false,
  });

  const volumeName = positionals[0]?.trim();
  if (!volumeName) {
    console.error(
      `${colors.red("Error:")} Missing volume name.\n\nUsage: eda volume rm <name> [-y] [-f]\nExample: eda volume rm app-uploads\n`,
    );
    process.exit(1);
  }

  if (!values.yes && process.stdin.isTTY) {
    const confirmed = await askConfirm(
      `Are you sure you want to permanently delete volume "${colors.bold(volumeName)}"? All stored data will be lost. [y/N]: `,
      false,
    );
    if (!confirmed) {
      console.log(colors.dim("Volume removal cancelled."));
      return;
    }
  }

  const query = values.force ? "?force=true" : "";
  try {
    await api<{ ok: boolean; removed: string }>(
      `/api/volumes/${encodeURIComponent(volumeName)}${query}`,
      { method: "DELETE" },
    );

    console.log(
      `\n${colors.green("✔")} Persistent volume "${colors.bold(volumeName)}" was successfully removed.\n`,
    );
  } catch (err) {
    throw handleFetchError(err, baseUrl());
  }
}
