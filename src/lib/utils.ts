import { colors } from "@explita/infra-protocol";

export function displayError(error: unknown, exit = true) {
  console.error(
    `\n${colors.red(colors.bold("Error:"))} ${error instanceof Error ? error.message : error}\n`,
  );

  if (exit) {
    process.exitCode = 1;
  }
}

export interface CommandOpts {
  product: string;
  desc: string;
  usage?: string | string[];
  commandsHeading?: string;
  commands: [string, string][];
  examples?: [string, string][];
  options?: [string, string][];
  footerNote?: string;
}

export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function padEndVisual(str: string, targetLength: number): string {
  const visibleLen = stripAnsi(str).length;
  const paddingNeeded = Math.max(0, targetLength - visibleLen);
  return str + " ".repeat(paddingNeeded);
}

export function printCmdAndDec(opts: CommandOpts) {
  const formatted: string[] = [];
  const examples: string[] = [];
  const options: string[] = [];

  const maxCmdLen =
    Math.max(...opts.commands.map(([k]) => stripAnsi(k).length)) + 2;
  const maxExLen =
    Math.max(...(opts.examples || []).map(([k]) => stripAnsi(k).length), 0) + 2;
  const maxOptLen =
    Math.max(...(opts.options || []).map(([k]) => stripAnsi(k).length), 0) + 2;

  for (const [cmd, dec] of opts.commands) {
    formatted.push(dec ? `${padEndVisual(cmd, maxCmdLen)} ${dec}` : cmd);
  }
  for (const [cmd, dec] of opts.examples || []) {
    examples.push(dec ? `${padEndVisual(cmd, maxExLen)} ${dec}` : cmd);
  }
  for (const [cmd, dec] of opts.options || []) {
    options.push(dec ? `${padEndVisual(cmd, maxOptLen)} ${dec}` : cmd);
  }

  const sections: string[] = [
    `${colors.bold(opts.product)} - ${colors.dim(opts.desc)}`,
  ];

  if (opts.usage) {
    const usageLines = Array.isArray(opts.usage) ? opts.usage : [opts.usage];
    sections.push("", colors.bold("Usage:"), `  ${usageLines.join("\n  ")}`);
    const heading = opts.commandsHeading || "Commands:";
    sections.push("", colors.bold(heading), `  ${formatted.join("\n  ")}`);
  } else {
    const heading = opts.commandsHeading || "Usage:";
    sections.push("", colors.bold(heading), `  ${formatted.join("\n  ")}`);
  }

  if (examples.length > 0) {
    sections.push("", colors.bold("Examples:"), `  ${examples.join("\n  ")}`);
  }

  if (options.length > 0) {
    sections.push("", colors.bold("Options:"), `  ${options.join("\n  ")}`);
  }

  if (opts.footerNote) {
    sections.push("", colors.dim(opts.footerNote));
  }

  console.log(`\n${sections.join("\n")}\n`);
}
