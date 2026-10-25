import http from "node:http";
import https from "node:https";
import {
  HOP_BY_HOP_HEADERS,
  sanitizeCloseCode,
  type StreamSender,
  type TunnelRequest,
  type TunnelWsOpen,
  type TunnelWsData,
  type TunnelWsClose,
} from "@explita/infra-protocol";

interface LocalWsEntry {
  socket: WebSocket;
  send: (data: string, isBinary?: boolean) => void;
  close: (code?: number, reason?: string) => void;
}

export type { StreamSender };

export class LocalProxy {
  private readonly wsConnections = new Map<string, LocalWsEntry>();

  constructor(
    private readonly target: string,
    private readonly hostHeader?: string,
  ) {}

  async handleStream(
    request: TunnelRequest,
    sender: StreamSender,
  ): Promise<number> {
    const url = new URL(request.path, this.target);
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    const outgoingHeaders: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      const lower = key.toLowerCase();
      if (
        !["connection", "accept-encoding", "content-length"].includes(lower)
      ) {
        outgoingHeaders[lower] = value;
      }
    }

    const originalHost = request.headers["host"] || url.host;

    if (!outgoingHeaders["x-forwarded-host"]) {
      outgoingHeaders["x-forwarded-host"] = originalHost;
    }
    if (!outgoingHeaders["x-forwarded-proto"]) {
      outgoingHeaders["x-forwarded-proto"] =
        request.headers["x-forwarded-proto"] || "http";
    }

    if (this.hostHeader) {
      if (
        this.hostHeader === "rewrite" ||
        this.hostHeader === "target" ||
        this.hostHeader === "localhost"
      ) {
        outgoingHeaders["host"] = url.host;
      } else {
        outgoingHeaders["host"] = this.hostHeader;
      }
    } else if (request.headers["host"]) {
      outgoingHeaders["host"] = request.headers["host"];
    } else {
      outgoingHeaders["host"] = url.host;
    }

    let reqBody: Buffer | string | undefined = undefined;
    if (
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      request.body != null
    ) {
      reqBody = request.isBinary
        ? Buffer.from(request.body, "base64")
        : request.body;
      if (reqBody) {
        outgoingHeaders["content-length"] = String(
          Buffer.isBuffer(reqBody)
            ? reqBody.length
            : Buffer.byteLength(reqBody, "utf8"),
        );
      }
    }

    return new Promise<number>((resolve) => {
      const clientReq = transport.request(
        {
          hostname: url.hostname,
          port: url.port ? Number(url.port) : isHttps ? 443 : 80,
          path: url.pathname + url.search,
          method: request.method,
          headers: outgoingHeaders,
        },
        (res) => {
          const resHeaders: Record<string, string> = {};
          for (const [key, val] of Object.entries(res.headers)) {
            if (val != null && !HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
              resHeaders[key] = Array.isArray(val)
                ? val.join(", ")
                : String(val);
            }
          }

          const status = res.statusCode || 200;
          sender.start(status, resHeaders);

          res.on("data", (chunk: Buffer) => {
            sender.chunk(chunk.toString("base64"), true);
          });

          res.on("end", () => {
            sender.end();
            resolve(status);
          });

          res.on("error", (err) => {
            sender.error(err.message || "Response stream error");
            resolve(status);
          });
        },
      );

      clientReq.on("error", (err) => {
        sender.error(err.message || "Connection failed", "BAD_GATEWAY");
        resolve(502);
      });

      if (reqBody) {
        clientReq.write(reqBody);
      }
      clientReq.end();
    });
  }

  handleWsOpen(
    message: TunnelWsOpen,
    onData: (id: string, data: string, isBinary?: boolean) => void,
    onClose: (id: string, code?: number, reason?: string) => void,
  ): void {
    const wsTarget = this.target.replace(/^http/, "ws");
    const url = new URL(message.path, wsTarget);

    let localWs: WebSocket;
    try {
      localWs = new WebSocket(url.toString());
    } catch (err) {
      onClose(
        message.id,
        1011,
        err instanceof Error
          ? err.message
          : "Failed to connect to local WebSocket",
      );
      return;
    }

    const pendingQueue: Array<{ data: string; isBinary?: boolean }> = [];
    let isOpen = false;
    let closed = false;

    localWs.binaryType = "arraybuffer";

    const emitClose = (code?: number, reason?: string) => {
      if (closed) return;
      closed = true;
      this.wsConnections.delete(message.id);
      onClose(message.id, code, reason);
    };

    localWs.addEventListener("open", () => {
      isOpen = true;
      while (pendingQueue.length > 0) {
        const item = pendingQueue.shift()!;
        if (localWs.readyState === WebSocket.OPEN) {
          if (item.isBinary) {
            const buf = Buffer.from(item.data, "base64");
            localWs.send(buf);
          } else {
            localWs.send(item.data);
          }
        }
      }
    });

    localWs.addEventListener("message", async (event: MessageEvent) => {
      if (typeof event.data === "string") {
        onData(message.id, event.data, false);
      } else if (event.data instanceof ArrayBuffer) {
        const base64 = Buffer.from(event.data).toString("base64");
        onData(message.id, base64, true);
      } else if (event.data instanceof Blob) {
        const buf = Buffer.from(await event.data.arrayBuffer());
        onData(message.id, buf.toString("base64"), true);
      } else {
        const base64 = Buffer.from(event.data as any).toString("base64");
        onData(message.id, base64, true);
      }
    });

    localWs.addEventListener("close", (event: CloseEvent) => {
      emitClose(event.code, event.reason);
    });

    localWs.addEventListener("error", () => {
      emitClose(1011, "Local WebSocket error");
    });

    this.wsConnections.set(message.id, {
      socket: localWs,
      send: (data: string, isBinary?: boolean) => {
        if (!isOpen || localWs.readyState === WebSocket.CONNECTING) {
          pendingQueue.push({ data, isBinary });
        } else if (localWs.readyState === WebSocket.OPEN) {
          if (isBinary) {
            const buf = Buffer.from(data, "base64");
            localWs.send(buf);
          } else {
            localWs.send(data);
          }
        }
      },
      close: (code?: number, reason?: string) => {
        this.wsConnections.delete(message.id);
        if (
          localWs.readyState === WebSocket.OPEN ||
          localWs.readyState === WebSocket.CONNECTING
        ) {
          try {
            const validCode = sanitizeCloseCode(code);
            localWs.close(validCode, reason);
          } catch {
            try {
              localWs.close();
            } catch {
              // Ignore if already closing/closed
            }
          }
        }
      },
    });
  }

  handleWsData(message: TunnelWsData): void {
    const entry = this.wsConnections.get(message.id);
    if (entry) {
      entry.send(message.data, message.isBinary);
    }
  }

  handleWsClose(message: TunnelWsClose): void {
    const entry = this.wsConnections.get(message.id);
    if (entry) {
      entry.close(message.code, message.reason);
    }
  }

  closeAll(): void {
    for (const [, entry] of this.wsConnections) {
      try {
        entry.close(1000, "Shutting down");
      } catch {
        // Ignore errors during shutdown
      }
    }
    this.wsConnections.clear();
  }
}
