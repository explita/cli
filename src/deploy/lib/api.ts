import {
  resolveDeployServer,
  resolveDeployToken,
} from "@explita/infra-protocol";
import { askQuestion } from "../../lib/prompt.js";
import { recordObservedServerVersion } from "./version-check.js";

// In-memory session credentials only (never stored to disk or environment)
let sessionPass: string | undefined = undefined;
let sessionOtp: string | undefined = undefined;

export function setSessionAuth(auth: { pass?: string; otp?: string }): void {
  if (auth.pass !== undefined) {
    sessionPass = auth.pass.trim() || undefined;
  }
  if (auth.otp !== undefined) {
    sessionOtp = auth.otp.trim() || undefined;
  }
}

export function getSessionPass(): string | undefined {
  return sessionPass;
}

export function getSessionOtp(): string | undefined {
  return sessionOtp;
}

export const baseUrl = (): string => {
  const url = resolveDeployServer();
  if (!url) {
    throw new Error(
      "No deploy server configured. Run 'eda config set server <url>' (or 'explita config set deploy.server <url>') or set EXPLITA_DEPLOY_SERVER.",
    );
  }
  return url.replace(/\/+$/, "");
};

export const authToken = (): string => {
  const token = resolveDeployToken();
  if (!token) {
    throw new Error(
      "No deploy token configured. Run 'eda config set token <token>' (or 'explita config set deploy.token <token>') or set EXPLITA_DEPLOY_TOKEN.",
    );
  }
  return token;
};

export function wsHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${authToken()}`,
  };
  if (sessionPass) {
    headers["x-explita-pass"] = sessionPass;
  }
  if (sessionOtp) {
    headers["x-explita-2fa"] = sessionOtp;
  }
  return headers;
}

export function wsOptions(): { headers: Record<string, string> } {
  return { headers: wsHeaders() };
}

export function wsUrl(path: string): string {
  const url = new URL(path, baseUrl());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", authToken());
  return url.toString();
}

export function handleFetchError(err: unknown, serverUrl: string): Error {
  if (err instanceof Error) {
    if (err.name === "TypeError" && err.message === "fetch failed") {
      const cause = (err as any).cause;
      const code = cause?.code || "";
      const causeMsg = cause?.message || "";

      if (code === "ECONNREFUSED" || causeMsg.includes("ECONNREFUSED")) {
        return new Error(
          `Could not connect to deploy server at ${serverUrl}. Is the server running?`,
        );
      }
      if (code === "ENOTFOUND" || causeMsg.includes("ENOTFOUND")) {
        return new Error(
          `Could not resolve deploy server host (${serverUrl}). Check your server URL and network connection.`,
        );
      }
      if (code === "ETIMEDOUT" || causeMsg.includes("ETIMEDOUT")) {
        return new Error(
          `Connection to deploy server at ${serverUrl} timed out.`,
        );
      }
      if (code === "ECONNRESET" || causeMsg.includes("ECONNRESET")) {
        return new Error(
          `Connection to deploy server at ${serverUrl} was reset unexpectedly.`,
        );
      }
      if (
        code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
        causeMsg.includes("self-signed certificate") ||
        causeMsg.includes("certificate")
      ) {
        return new Error(
          `SSL/TLS certificate verification failed for ${serverUrl}: ${causeMsg}`,
        );
      }
      if (causeMsg) {
        return new Error(
          `Failed to connect to deploy server at ${serverUrl}: ${causeMsg}`,
        );
      }
      return new Error(
        `Failed to reach deploy server at ${serverUrl}. Ensure the server is online.`,
      );
    }
    return err;
  }
  return new Error(String(err));
}

export async function apiRaw(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const server = baseUrl();
  const headers: Record<string, string> = {
    authorization: `Bearer ${authToken()}`,
  };

  if (sessionPass) {
    headers["x-explita-pass"] = sessionPass;
  }
  if (sessionOtp) {
    headers["x-explita-2fa"] = sessionOtp;
  }

  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((val, key) => {
        headers[key.toLowerCase()] = val;
      });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) {
        headers[k.toLowerCase()] = v;
      }
    } else {
      for (const [k, v] of Object.entries(init.headers)) {
        headers[k.toLowerCase()] = String(v);
      }
    }
  }

  if (init.body && !headers["content-type"] && typeof init.body === "string") {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(`${server}${path}`, {
      ...init,
      headers,
    });
  } catch (err) {
    throw handleFetchError(err, server);
  }

  const serverVersion = response.headers.get("x-explita-version");
  if (serverVersion) {
    recordObservedServerVersion(serverVersion);
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : await response.text();

    if (response.status === 401) {
      const errObj = typeof data === "object" && data ? (data as any) : {};

      if (errObj.requiresPasscode) {
        if (!sessionPass && process.stdin.isTTY) {
          const enteredPass = await askQuestion(
            "🔑 Enter deploy passcode / PIN: ",
          );
          if (enteredPass) {
            setSessionAuth({ pass: enteredPass });
            return apiRaw(path, init);
          }
        }
        throw new Error(
          "Passcode authentication failed or required. Provide --pass <pin>.",
        );
      }

      if (errObj.requires2FA) {
        if (process.stdin.isTTY) {
          const enteredOtp = await askQuestion(
            "🔑 Enter 6-digit 2FA code (Google Authenticator): ",
          );
          if (enteredOtp) {
            setSessionAuth({ otp: enteredOtp });
            return apiRaw(path, init);
          }
        }
        throw new Error(
          "2-Factor Authentication failed or required. Provide valid 6-digit code via --otp <code>.",
        );
      }

      throw new Error(
        "Authentication failed (401 Unauthorized). Check your deploy token with 'eda config get token' (or 'explita config get deploy.token').",
      );
    }
    if (response.status === 403) {
      throw new Error(
        "Access denied (403 Forbidden). Token does not have permission for this action.",
      );
    }
    if (response.status === 404) {
      const errorMsg =
        typeof data === "object" && data && "error" in data
          ? (data as any).error
          : `Resource not found (404): ${path}`;
      throw new Error(errorMsg);
    }
    if (response.status === 502 || response.status === 503) {
      throw new Error(
        `Deploy server gateway unavailable (${response.status}). The server or proxy is currently unavailable.`,
      );
    }

    const errorMsg =
      typeof data === "object" && data && "error" in data
        ? (data as any).error
        : typeof data === "string" && data
          ? data
          : `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return response;
}

export async function api<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await apiRaw(path, init);

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : await response.text();

  if (
    typeof data === "object" &&
    data &&
    "success" in data &&
    !(data as any).success
  ) {
    throw new Error((data as any).error || "Request failed");
  }

  if (typeof data === "object" && data && "success" in data && "data" in data) {
    return (data as any).data as T;
  }
  return data as T;
}
