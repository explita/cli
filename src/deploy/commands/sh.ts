import { wsUrl, wsOptions } from "../lib/api.js";
import { parseAppCommand } from "../lib/resolve-app.js";
import { PRODUCT_NAME, colors } from "@explita/infra-protocol";

import { printCmdAndDec } from "../../lib/utils.js";

function printShHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.deploy} Remote Shell`,
    desc: "Open an interactive remote terminal inside running container",
    commands: [
      [
        "eda sh [-a <appId>] [-s <shell>]",
        "Attach to remote interactive shell",
      ],
      ["eda shell [-a <appId>] [-s <shell>]", "Alias for eda sh"],
      [
        "eda exec -it [-a <appId>] [-- <cmd...>]",
        "Interactive terminal execution",
      ],
    ],
    examples: [
      ["eda sh", "Attach to current project's container shell"],
      ["eda sh -a my-app", "Attach to specific application shell"],
      ["eda sh -a my-app -s bash", "Attach using bash shell"],
      ["eda exec -it -a my-app", "Interactive terminal alias"],
    ],
    options: [
      [
        "-a, --app <appId>",
        "Target application ID (or auto-resolved from config)",
      ],
      ["-s, --shell <shell>", 'Shell program to launch (default: "sh")'],
      ["-h, --help", "Show help"],
    ],
  });
}

export async function runShCommand(args: string[]): Promise<void> {
  if (args.includes("-h") || args.includes("--help")) {
    printShHelp();
    return;
  }

  // Filter out any standalone -it, -i, -t flags passed from eda exec -it
  const cleanArgs = args.filter(
    (arg) => arg !== "-it" && arg !== "-i" && arg !== "-t",
  );

  const { appId, positionals } = parseAppCommand(cleanArgs, "sh");

  // Check for shell option
  let shell = "sh";
  for (let i = 0; i < cleanArgs.length; i++) {
    if (
      (cleanArgs[i] === "-s" || cleanArgs[i] === "--shell") &&
      cleanArgs[i + 1]
    ) {
      shell = cleanArgs[i + 1];
      break;
    }
  }

  const query = new URLSearchParams();
  if (shell) query.set("shell", shell);
  if (positionals.length > 0) {
    query.set("cmd", positionals.join(" "));
  }

  const path = `/api/apps/${encodeURIComponent(appId)}/sh?${query.toString()}`;
  const url = wsUrl(path);

  const WS = (globalThis as any).WebSocket;
  if (typeof WS !== "function") {
    throw new Error("WebSocket is not supported in this Node environment.");
  }

  process.stdout.write(
    `${colors.dim(`Connecting interactive remote shell to ${appId}...`)}\r\n`,
  );

  return new Promise<void>((resolve, reject) => {
    let socket: any;
    try {
      socket = new WS(url, wsOptions());
      socket.binaryType = "arraybuffer";
    } catch (err) {
      reject(err);
      return;
    }

    const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);

    const restoreTerminal = () => {
      if (isTTY) {
        try {
          process.stdin.setRawMode(false);
        } catch {}
      }
      process.stdin.pause();
    };

    const cleanup = () => {
      restoreTerminal();
      process.stdout.removeListener("resize", onResize);
      process.stdin.removeListener("data", onStdinData);
    };

    const onResize = () => {
      if (socket && socket.readyState === socket.OPEN && isTTY) {
        try {
          socket.send(
            JSON.stringify({
              type: "resize",
              cols: process.stdout.columns || 80,
              rows: process.stdout.rows || 24,
            }),
          );
        } catch {}
      }
    };

    const onStdinData = (data: Buffer) => {
      if (socket && socket.readyState === socket.OPEN) {
        socket.send(data);
      }
    };

    socket.onopen = () => {
      if (isTTY) {
        try {
          process.stdin.setRawMode(true);
        } catch {}
      }
      process.stdin.resume();
      process.stdin.on("data", onStdinData);
      process.stdout.on("resize", onResize);

      // Send initial terminal dimensions immediately
      onResize();
    };

    socket.onmessage = (event: any) => {
      if (typeof event.data === "string") {
        process.stdout.write(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        process.stdout.write(Buffer.from(event.data));
      } else if (Buffer.isBuffer(event.data)) {
        process.stdout.write(event.data);
      } else if (event.data && typeof event.data.arrayBuffer === "function") {
        event.data.arrayBuffer().then((ab: ArrayBuffer) => {
          process.stdout.write(Buffer.from(ab));
        });
      }
    };

    socket.onerror = (event: any) => {
      cleanup();
      const message = event?.message || "Remote shell connection failed";
      reject(new Error(message));
    };

    socket.onclose = (event: any) => {
      cleanup();
      process.stdout.write("\r\n");
      if (event?.code && event.code !== 1000 && event.code !== 1005) {
        const reason = event?.reason ? ` (${event.reason})` : "";
        reject(
          new Error(`Remote shell closed with code ${event.code}${reason}`),
        );
      } else {
        resolve();
      }
    };
  });
}
