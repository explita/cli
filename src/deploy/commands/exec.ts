import { apiRaw } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { PRODUCT_NAME } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";
import { runShCommand } from "./sh.js";

function printExecHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Exec`,
    desc: "Run one-off commands inside active application container",
    commands: [
      [
        "eda exec [-a <appId>] -- <command...>",
        "Run one-off command in application container",
      ],
      [
        "eda exec -it [-a <appId>]",
        "Open interactive terminal shell (alias: eda sh)",
      ],
      ["eda run [-a <appId>] -- <command...>", "Shorthand execution alias"],
    ],
    examples: [
      ["eda exec -a my-app -- npm run migrate", "Run npm database migration"],
      [
        "eda exec -a my-app -- npx prisma migrate deploy",
        "Deploy Prisma migrations",
      ],
      ["eda exec -it -a my-app", "Open interactive pseudo-TTY terminal"],
      [
        "eda exec -a my-app -- ls -la",
        "Inspect container filesystem directory",
      ],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (or auto-resolved from config)",
      ],
      [
        "-it",
        "Open full interactive pseudo-TTY terminal shell (alias: eda sh)",
      ],
      ["-h, --help", "Show help"],
    ],
  });
}

export async function runExecCommand(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    printExecHelp();
    return;
  }

  // If interactive terminal flags requested, delegate to interactive remote shell
  if (args.includes("-it") || (args.includes("-i") && args.includes("-t"))) {
    return runShCommand(args);
  }

  const { appId, positionals } = parseAppCommand(args, "exec");

  const command = positionals.join(" ").trim();
  if (!command) {
    throw new Error(
      "No command specified to execute. Usage: eda exec [-a <appId>] -- <command...>",
    );
  }

  const response = await apiRaw(`/api/apps/${encodeURIComponent(appId)}/exec`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command }),
  });

  if (!response.body) {
    throw new Error("No response body received from deploy server.");
  }

  let exitCode = 0;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line);
      if (event.type === "stdout" && event.data) {
        process.stdout.write(event.data);
      } else if (event.type === "stderr" && event.data) {
        process.stderr.write(event.data);
      } else if (event.type === "exit" && typeof event.code === "number") {
        exitCode = event.code;
      }
    } catch {
      // If line is plain text
      process.stdout.write(line + "\n");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      handleLine(line);
    }
  }

  if (buffer.trim()) {
    handleLine(buffer);
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
