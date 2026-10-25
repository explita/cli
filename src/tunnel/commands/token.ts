import { parseArgs } from "node:util";
import { stdin as input } from "node:process";
import { printError } from "../lib/logger.js";
import { askQuestion } from "../../lib/prompt.js";
import {
  DEFAULT_TUNNEL_SERVER_URL,
  LOCAL_TUNNEL_SERVER_URL,
} from "../lib/constants.js";
import {
  getGlobalConfigPath as getConfigPath,
  loadTunnelConfig as loadUserConfig,
  PRODUCT_NAME,
  saveTunnelConfig as saveUserConfig,
  colors,
  normalizeTunnelServerUrl,
} from "@explita/infra-protocol";

import { printCmdAndDec } from "../../lib/utils.js";

function printTokenHelp(): void {
  printCmdAndDec({
    product: `${PRODUCT_NAME.tunnel} Token`,
    desc: "Manage authentication token",
    commands: [
      [
        "explita tunnel token -e <email>",
        "Request verification code & save token",
      ],
      ["explita tunnel token -e <email> -v <code>", "Verify OTP code directly"],
      ["explita tunnel token", "Show currently saved token"],
      ["explita tunnel token --clear", "Clear saved token"],
    ],
    options: [
      ["-e, --email <email>", "Your email address (e.g. someone@explita.ng)"],
      ["-v, --verify <code>", "6-digit verification code (alias: --otp)"],
      ["-S, --server <url>", "Tunnel server URL"],
      ["-h, --help", "Show help"],
    ],
  });
}

function toHttpEndpoint(serverUrl: string, endpointPath: string): string {
  const normalized = normalizeTunnelServerUrl(serverUrl);
  const url = new URL(normalized);
  const protocol = url.protocol === "wss:" ? "https:" : "http:";
  return `${protocol}//${url.host}${endpointPath}`;
}

async function verifyAndSave(
  baseServer: string,
  email: string,
  otp: string,
  configPath: string,
): Promise<void> {
  const endpointUrl = toHttpEndpoint(baseServer, "/_api/token/verify-otp");

  const res = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ email, otp }),
  });

  const data = (await res.json()) as {
    success?: boolean;
    token?: string;
    email?: string;
    error?: string;
    message?: string;
  };

  if (!res.ok || !data.token) {
    throw new Error(data.error || `Verification failed (status ${res.status})`);
  }

  saveUserConfig({
    token: data.token,
    email: data.email || email,
  });

  console.log(
    `\n${colors.green(colors.bold("✨ Verification successful! Token saved."))}`,
  );
  console.log(`Email:    ${colors.bold(data.email || email)}`);
  console.log(`Token:    ${colors.cyan(data.token)}`);
  console.log(`Location: ${colors.dim(configPath)}`);
  console.log(`\nYou're all set! Start tunnels anytime with:`);
  console.log(`  ${colors.bold("eta <port>")}\n`);
}

export async function runTokenCommand(args: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        email: {
          type: "string",
          short: "e",
        },
        verify: {
          type: "string",
          short: "v",
        },
        otp: {
          type: "string",
        },
        server: {
          type: "string",
          short: "S",
        },
        local: {
          type: "boolean",
          short: "l",
        },
        clear: {
          type: "boolean",
        },
        help: {
          type: "boolean",
          short: "h",
        },
      },
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const { values, positionals } = parsed;

  if (values.help) {
    printTokenHelp();
    return;
  }

  const configPath = getConfigPath();

  if (values.clear) {
    saveUserConfig({ token: undefined, email: undefined });
    console.log(
      `\n${colors.green("✓")} Token cleared from ${colors.bold(configPath)}\n`,
    );
    return;
  }

  // Allow email as positional argument: `eta token someone@explita.ng`
  const emailInput = values.email || positionals[0];

  if (!emailInput) {
    const existing = loadUserConfig();
    if (existing?.token) {
      console.log(`\n${colors.green(colors.bold("Current saved token:"))}`);
      if (existing.email) {
        console.log(`Email:    ${colors.bold(existing.email)}`);
      }
      console.log(`Token:    ${colors.cyan(existing.token)}`);
      console.log(`Location: ${colors.dim(configPath)}\n`);
    } else {
      console.log(`\n${colors.yellow("No token currently saved.")}`);
      console.log(
        `Run ${colors.bold("explita tunnel token -e <email>")} to request and save one.\n`,
      );
    }
    return;
  }

  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    printError(
      "Invalid email",
      new Error(`"${emailInput}" is not a valid email address.`),
    );
    process.exit(1);
  }

  const baseServer =
    values.server ||
    (values.local ? LOCAL_TUNNEL_SERVER_URL : undefined) ||
    process.env.TUNNEL_SERVER_URL ||
    DEFAULT_TUNNEL_SERVER_URL;

  const directOtp = values.verify || values.otp;

  // Case 1: OTP was provided via -v <code> or --otp <code>
  if (directOtp) {
    try {
      await verifyAndSave(baseServer, email, directOtp.trim(), configPath);
    } catch (err) {
      printError("Verification failed", err);
      process.exit(1);
    }
    return;
  }

  // Case 2: Request OTP from server, then prompt interactively or guide user
  try {
    const requestUrl = toHttpEndpoint(baseServer, "/_api/token/request-otp");
    const reqRes = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ email }),
    });

    const reqData = (await reqRes.json()) as {
      success?: boolean;
      error?: string;
      message?: string;
    };

    if (!reqRes.ok || !reqData.success) {
      throw new Error(
        reqData.error || `Server responded with status ${reqRes.status}`,
      );
    }

    console.log(
      `\n${colors.cyan("📩")} A 6-digit verification code was sent to ${colors.bold(email)}.`,
    );

    if (input.isTTY) {
      const enteredOtp = await askQuestion(
        `\n${colors.bold("Enter the 6-digit code:")} `,
      );

      const trimmed = enteredOtp.trim();
      if (!trimmed) {
        console.log(`\n${colors.yellow("Verification cancelled.")}\n`);
        return;
      }

      await verifyAndSave(baseServer, email, trimmed, configPath);
    } else {
      console.log(`\nTo complete verification, run:`);
      console.log(
        `  ${colors.bold(`explita tunnel token -e ${email} -v <code>`)}\n`,
      );
    }
  } catch (err) {
    printError("Failed to obtain token", err);
    process.exit(1);
  }
}
