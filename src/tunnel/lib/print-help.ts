import { PRODUCT_NAME } from "@explita/infra-protocol";
import { printCmdAndDec } from "../../lib/utils.js";

export function printHelp(): void {
  printCmdAndDec({
    product: PRODUCT_NAME.tunnel,
    desc: "Expose local servers to the internet",
    commands: [
      ["eta <port> [options]", "Expose local port to internet"],
      ["eta", "Start tunnel using local explita.json configuration"],
      ["eta init [port]", "Initialize project tunnel configuration"],
      ["eta config [cmd]", "Manage local and global configuration"],
      ["eta token -e <email>", "Authenticate with email verification code"],
    ],
    options: [
      ["-p, --port <number>", "Local port to expose (e.g. 3000)"],
      [
        "-s, --subdomain <name>",
        "Request a custom subdomain (3 to 32 characters)",
      ],
      [
        "-a, --auth <user:pass>",
        'Protect tunnel with Basic HTTP Authentication (e.g. -a "alice:secret")',
      ],
      [
        "-i, --allow-ip <cidr>",
        'Restrict tunnel access to specific IP or CIDR (e.g. -i "1.2.3.4, 10.0.0.0/8")',
      ],
      [
        "-H, --host-header <host>",
        "Rewrite Host header to target or custom host (e.g. -H rewrite)",
      ],
      ["--host <host>", "Target host (default: localhost)"],
      ["--target <url>", "Full target URL (e.g. http://192.168.1.50:3000)"],
      ["-S, --server <url>", "Tunnel server WebSocket URL"],
      ["-t, --token <token>", "Authentication token"],
      ["-R, --no-reconnect", "Do not automatically reconnect on disconnect"],
      [
        "-E, --no-encrypt",
        "Disable inner session encryption (send plaintext JSON)",
      ],
      [
        "--inspect [port]",
        "Enable local request inspector web UI (override port, e.g. --inspect 5000)",
      ],
      ["--no-inspect", "Disable local web inspector dashboard"],
      ["-h, --help", "Show help"],
    ],
  });
}
