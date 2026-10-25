import type { AgentConfig } from "../lib/args.js";
import {
  logRequest,
  logReplay,
  logWs,
  printDisconnect,
  printTunnelStatus,
} from "../lib/logger.js";
import { TunnelClient, TunnelReady } from "./client.js";
import { LocalProxy } from "./proxy.js";
import {
  RequestRingBuffer,
  startInspectorServer,
  attachKeyboardShortcuts,
  type InspectorServerInstance,
} from "../inspector/index.js";
import { INSPECTOR_PORT, TUNNEL_SERVER_URL } from "../lib/constants.js";

export class TunnelAgent {
  private readonly client: TunnelClient;
  private readonly proxy: LocalProxy;
  private readonly targetUrl: string;
  private readonly ringBuffer = new RequestRingBuffer(50);
  private inspectorServer?: InspectorServerInstance;
  private detachKeyboard?: () => void;
  private latestTunnelReady?: TunnelReady;
  private isConnected = false;

  constructor(private readonly config: AgentConfig) {
    const resolvedServer =
      config.server ||
      process.env.TUNNEL_SERVER_URL ||
      TUNNEL_SERVER_URL;

    this.client = new TunnelClient({
      server: resolvedServer,
      token: config.token,
      subdomain: config.subdomain,
      auth: config.auth,
      allowedIps: config.allowedIps,
      reconnect: config.reconnect ?? true,
      encrypt: config.encrypt ?? true,
      inspect: config.inspect ?? false,
    });

    this.targetUrl =
      config.target ??
      `http://${config.host || "localhost"}:${config.port}`;

    this.proxy = new LocalProxy(
      this.targetUrl,
      config.hostHeader,
    );

    this.setupListeners();
  }

  private get isInspectActive(): boolean {
    return (
      this.config.inspect === true || typeof this.config.inspect === "number"
    );
  }

  private setupListeners(): void {
    this.client.onRequest(async (request, sender) => {
      this.ringBuffer.recordRequest(request);
      const start = Date.now();
      let responseStatus = 200;
      let responseHeaders: Record<string, string> = {};
      const resChunks: Buffer[] = [];
      let totalCapturedBytes = 0;
      const MAX_CAPTURE_BYTES = 2 * 1024 * 1024; // 2 MB max captured in inspector

      try {
        await this.proxy.handleStream(request, {
          start: (status, headers) => {
            responseStatus = status;
            responseHeaders = headers;
            const duration = Date.now() - start;
            this.ringBuffer.updateResponse(request.id, {
              status,
              duration,
              headers,
            });
            if (this.isInspectActive) {
              logRequest(request.method, request.path, status, duration);
            }
            sender.start(status, headers);
          },
          chunk: (chunk, isBinary) => {
            if (totalCapturedBytes < MAX_CAPTURE_BYTES) {
              const buf = isBinary
                ? Buffer.from(chunk, "base64")
                : Buffer.from(chunk, "utf8");
              resChunks.push(buf);
              totalCapturedBytes += buf.length;
            }
            sender.chunk(chunk, isBinary);
          },
          end: () => {
            const duration = Date.now() - start;
            if (resChunks.length > 0) {
              const combined = Buffer.concat(resChunks);
              const ctype = (
                responseHeaders["content-type"] || ""
              ).toLowerCase();
              const isText =
                ctype.includes("json") ||
                ctype.includes("text") ||
                ctype.includes("xml") ||
                ctype.includes("html") ||
                ctype.includes("javascript") ||
                ctype.includes("css") ||
                ctype.includes("svg") ||
                ctype.includes("form-urlencoded");

              if (isText) {
                this.ringBuffer.updateResponse(request.id, {
                  status: responseStatus,
                  duration,
                  headers: responseHeaders,
                  body: combined.toString("utf8"),
                  isBinary: false,
                });
              } else {
                this.ringBuffer.updateResponse(request.id, {
                  status: responseStatus,
                  duration,
                  headers: responseHeaders,
                  body: combined.toString("base64"),
                  isBinary: true,
                });
              }
            }
            sender.end();
          },
          error: (msg) => {
            const duration = Date.now() - start;
            this.ringBuffer.updateError(request.id, msg, duration);
            if (this.isInspectActive) {
              logRequest(
                request.method,
                request.path,
                502,
                duration,
                "Stream error",
              );
            }
            sender.error(msg, "BAD_GATEWAY", this.config.port);
          },
        });
      } catch (err) {
        const duration = Date.now() - start;
        const { message: errorMessage, shortCode } = extractTargetErrorDetails(
          err,
          this.config.port,
        );

        this.ringBuffer.updateError(request.id, errorMessage, duration);
        if (this.isInspectActive) {
          logRequest(request.method, request.path, 502, duration, shortCode);
        }

        sender.error(errorMessage, "BAD_GATEWAY", this.config.port);
      }
    });

    this.client.onWsOpen((message) => {
      if (this.isInspectActive) {
        logWs(message.path, "open", this.client.isEncrypted);
      }
      this.proxy.handleWsOpen(
        message,
        (id, data, isBinary) => {
          this.client.sendWsData(id, data, isBinary);
        },
        (id, code, reason) => {
          if (this.isInspectActive) {
            logWs(message.path, "close", this.client.isEncrypted);
          }
          this.client.sendWsClose(id, code, reason);
        },
      );
    });

    this.client.onWsData((message) => {
      this.proxy.handleWsData(message);
    });

    this.client.onWsClose((message) => {
      this.proxy.handleWsClose(message);
    });

    this.client.onReady((ready) => {
      this.latestTunnelReady = ready;
      this.inspectorServer?.setPublicUrl(ready.url);
      if (this.isConnected) {
        printTunnelStatus("reconnected", {
          url: ready.url,
          port: this.config.port,
          target: this.targetUrl,
          hostHeader: this.config.hostHeader,
          encrypted: this.client.isEncrypted,
          fingerprint: this.client.fingerprint,
          tokenActive: Boolean(this.config.token),
          authEnabled: Boolean(this.config.auth),
          ipFilterActive: Boolean(
            ready.ipFilterEnabled ||
            (this.config.allowedIps && this.config.allowedIps.length > 0),
          ),
          allowedIpsCount:
            ready.allowedIpsCount || this.config.allowedIps?.length,
          inspectorUrl: this.inspectorServer?.url,
          inspectActive: this.isInspectActive,
          message: ready.message,
        });
      }
    });

    this.client.onDisconnect(() => {
      this.client.disableWire();
      const shouldReconnect = this.config.reconnect ?? true;
      printDisconnect(shouldReconnect);
      if (!shouldReconnect) {
        process.exit(0);
      }
    });
  }

  async start(): Promise<TunnelReady> {
    const tunnel = await this.client.connect();
    this.isConnected = true;
    this.latestTunnelReady = tunnel;

    if (this.config.inspectUi) {
      try {
        this.inspectorServer = await startInspectorServer({
          localPort: this.config.port,
          ringBuffer: this.ringBuffer,
          preferredPort: this.config.inspectPort || INSPECTOR_PORT,
          publicUrl: tunnel.url,
          onReplayResult: (info) => {
            if (this.isInspectActive) {
              logReplay(
                info.method,
                info.path,
                info.status,
                info.duration,
                info.detail,
              );
            }
          },
        });
      } catch {
        // Fallback silently if inspector fails to start
      }
    }

    this.detachKeyboard = attachKeyboardShortcuts({
      localPort: this.config.port,
      ringBuffer: this.ringBuffer,
      enableReplay: this.isInspectActive,
      enableWireToggle: this.isInspectActive,
      onToggleWire: () => this.client.toggleWire(),
      onReplayResult: (info) => {
        if (this.isInspectActive) {
          logReplay(
            info.method,
            info.path,
            info.status,
            info.duration,
            info.detail,
          );
        }
      },
      onClearScreen: () => {
        if (this.latestTunnelReady) {
          printTunnelStatus("connected", {
            url: this.latestTunnelReady.url,
            port: this.config.port,
            target: this.targetUrl,
            hostHeader: this.config.hostHeader,
            encrypted: this.client.isEncrypted,
            fingerprint: this.client.fingerprint,
            tokenActive: Boolean(this.config.token),
            authEnabled: Boolean(this.config.auth),
            ipFilterActive: Boolean(
              this.latestTunnelReady.ipFilterEnabled ||
              (this.config.allowedIps && this.config.allowedIps.length > 0),
            ),
            allowedIpsCount:
              this.latestTunnelReady.allowedIpsCount ||
              this.config.allowedIps?.length,
            inspectorUrl: this.inspectorServer?.url,
            inspectActive: this.isInspectActive,
            message: this.latestTunnelReady.message,
          });
        }
      },
      onExit: () => {
        this.stop();
        setTimeout(() => process.exit(0), 50).unref();
      },
    });

    printTunnelStatus("connected", {
      url: tunnel.url,
      port: this.config.port,
      target: this.targetUrl,
      hostHeader: this.config.hostHeader,
      encrypted: this.client.isEncrypted,
      fingerprint: this.client.fingerprint,
      tokenActive: Boolean(this.config.token),
      authEnabled: Boolean(this.config.auth),
      ipFilterActive: Boolean(
        tunnel.ipFilterEnabled ||
        (this.config.allowedIps && this.config.allowedIps.length > 0),
      ),
      allowedIpsCount: tunnel.allowedIpsCount || this.config.allowedIps?.length,
      inspectorUrl: this.inspectorServer?.url,
      inspectActive: this.isInspectActive,
      message: tunnel.message,
    });

    return tunnel;
  }

  stop(): void {
    this.detachKeyboard?.();
    void this.inspectorServer?.close();
    this.proxy.closeAll();
    this.client.disableWire();
    this.client.disconnect();
  }
}

export function extractTargetErrorDetails(
  err: unknown,
  port: number,
): { message: string; shortCode: string } {
  if (err instanceof Error) {
    const cause = (err as { cause?: { code?: string; message?: string } })
      .cause;
    if (cause && typeof cause === "object") {
      if (cause.code === "ECONNREFUSED") {
        return {
          message: `Connection refused: No application is listening on http://localhost:${port} (ECONNREFUSED)`,
          shortCode: `ECONNREFUSED :${port}`,
        };
      }
      if (cause.code === "ECONNRESET") {
        return {
          message: `Connection reset by http://localhost:${port} (ECONNRESET)`,
          shortCode: `ECONNRESET :${port}`,
        };
      }
      if (cause.code === "ETIMEDOUT") {
        return {
          message: `Connection to http://localhost:${port} timed out (ETIMEDOUT)`,
          shortCode: `ETIMEDOUT :${port}`,
        };
      }
      if (cause.code) {
        return {
          message: `${cause.code}: Unable to reach http://localhost:${port}`,
          shortCode: `${cause.code} :${port}`,
        };
      }
    }

    if (err.message === "fetch failed") {
      return {
        message: `Connection refused: Unable to reach http://localhost:${port} (local server offline)`,
        shortCode: `ECONNREFUSED :${port}`,
      };
    }

    return {
      message: err.message || "Connection failed",
      shortCode: err.name || "Error",
    };
  }

  return {
    message: "Connection failed",
    shortCode: "ERR_FAILED",
  };
}
