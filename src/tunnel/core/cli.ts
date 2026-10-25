#!/usr/bin/env node

import { parseCliArgs } from "../lib/args.js";
import { TunnelAgent } from "./agent.js";
import { printError } from "../lib/logger.js";
import { runTokenCommand } from "../commands/token.js";
import { runConfigCommand } from "../commands/config.js";
import { runInitCommand } from "../commands/init.js";

export async function runTunnelCli(args: string[]): Promise<void> {
  const firstArg = args[0]?.toLowerCase();

  if (firstArg === "token" || firstArg === "login") {
    await runTokenCommand(args.slice(1));
    return;
  }

  if (firstArg === "config") {
    await runConfigCommand(args.slice(1));
    return;
  }

  if (firstArg === "init") {
    await runInitCommand(args.slice(1));
    return;
  }

  const config = parseCliArgs(args);
  const agent = new TunnelAgent(config);

  process.on("SIGINT", () => {
    agent.stop();
    setTimeout(() => process.exit(0), 50).unref();
  });

  process.on("SIGTERM", () => {
    agent.stop();
    setTimeout(() => process.exit(0), 50).unref();
  });

  try {
    await agent.start();
  } catch (error) {
    printError("Failed to connect", error);
    process.exit(1);
  }
}
