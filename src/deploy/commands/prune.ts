import { parseArgs } from "node:util";
import { api, handleFetchError, baseUrl } from "../lib/api.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

function printPruneHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Prune`,
    desc: "VPS disk hygiene and Docker resource maintenance",
    commands: [
      [
        "eda prune [options]",
        "Clean up unused Docker images, caches and stopped containers",
      ],
    ],
    examples: [
      [
        "eda prune",
        "Prune dangling images, BuildKit build cache, and dead containers",
      ],
      [
        "eda prune --all",
        "Also prune all unused images and intentionally stopped containers",
      ],
    ],
    options: [
      [
        "-a, --all",
        "Include all unused images and paused/stopped application containers",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

import type { PruneResult } from "@explita/infra-protocol/deploy";

export async function runPruneCommand(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    printPruneHelp();
    return;
  }

  const { values } = parseArgs({
    args,
    options: {
      all: { type: "boolean", short: "a", default: false },
    },
    allowPositionals: true,
  });

  const pruneAll = Boolean(values.all);

  process.stdout.write(
    `\nPruning VPS Docker resources (${pruneAll ? "including all unused images and paused containers" : "build cache, dangling images, and dead containers"})...\n\n`,
  );

  try {
    const result = await api<PruneResult>("/api/system/prune", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: pruneAll }),
    });

    console.log(
      `  ${colors.green("✔")} ${colors.bold("BuildKit Cache:")}     Reclaimed ${colors.cyan(result.builderReclaimed)}`,
    );
    console.log(
      `  ${colors.green("✔")} ${colors.bold("Docker Images:")}      Reclaimed ${colors.cyan(result.imagesReclaimed)}`,
    );
    console.log(
      `  ${colors.green("✔")} ${colors.bold("Stopped Containers:")} ${result.containersRemoved} removed${result.containers.length ? ` ${colors.dim(`(${result.containers.join(", ")})`)}` : ""}`,
    );
    if (
      typeof result.cronRecordsPruned === "number" &&
      result.cronRecordsPruned > 0
    ) {
      console.log(
        `  ${colors.green("✔")} ${colors.bold("Cron History:")}       ${result.cronRecordsPruned} old execution records pruned`,
      );
    }

    console.log(
      `\n${colors.green("✔")} ${colors.bold("VPS disk maintenance complete.")}\n`,
    );
  } catch (err) {
    throw handleFetchError(err, baseUrl());
  }
}
