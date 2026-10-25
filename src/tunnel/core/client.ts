import {
  computeFingerprint,
  decode,
  decryptPayload,
  encode,
  encryptPayload,
  generateEcdhKeyPair,
  PROTOCOL_VERSION,
  type TunnelMessage,
  type TunnelReady,
  type TunnelRequest,
  type TunnelWsOpen,
  type TunnelWsData,
  type TunnelWsClose,
  type StreamSender,
} from "@explita/infra-protocol";
import { logWire } from "../lib/logger.js";

export type {
  StreamSender,
  TunnelMessage,
  TunnelReady,
  TunnelRequest,
  TunnelWsOpen,
  TunnelWsData,
  TunnelWsClose,
};

export type TunnelClientOptions = {
  server: string;
  token?: string;
  subdomain?: string;
  auth?: string;
  allowedIps?: string[];
  reconnect?: boolean;
  reconnectDelayMs?: number;
  encrypt?: boolean;
  inspect?: boolean | number;
};

export type RequestHandler = (
  request: TunnelRequest,
  sender: StreamSender,
) => Promise<void>;

export type ReadyHandler = (ready: TunnelReady) => void;
export type DisconnectHandler = () => void;
export type WsOpenHandler = (message: TunnelWsOpen) => void;
export type WsDataHandler = (message: TunnelWsData) => void;
export type WsCloseHandler = (message: TunnelWsClose) => void;

export class TunnelClient {
  private socket?: WebSocket;
  private stopped = false;
  private isConnected = false;
  private isWireActive = false;
  private sharedKey?: Buffer;
  private sessionFingerprint?: string;
  private handler?: RequestHandler;
  private readyHandler?: ReadyHandler;
  private disconnectHandler?: DisconnectHandler;
  private wsOpenHandler?: WsOpenHandler;
  private wsDataHandler?: WsDataHandler;
  private wsCloseHandler?: WsCloseHandler;
  private currentSubdomain?: string;
  private currentTunnelId?: string;

  constructor(private readonly options: TunnelClientOptions) {
    this.currentSubdomain = options.subdomain;
  }

  get isEncrypted(): boolean {
    return Boolean(this.sharedKey);
  }

  get fingerprint(): string | undefined {
    return this.sessionFingerprint;
  }

  onRequest(handler: RequestHandler) {
    this.handler = handler;
  }

  onReady(handler: ReadyHandler) {
    this.readyHandler = handler;
  }

  onDisconnect(handler: DisconnectHandler) {
    this.disconnectHandler = handler;
  }

  onWsOpen(handler: WsOpenHandler) {
    this.wsOpenHandler = handler;
  }

  onWsData(handler: WsDataHandler) {
    this.wsDataHandler = handler;
  }

  onWsClose(handler: WsCloseHandler) {
    this.wsCloseHandler = handler;
  }

  enableWire(): void {
    this.isWireActive = true;
  }

  disableWire(): void {
    this.isWireActive = false;
  }

  get isWire(): boolean {
    return this.isWireActive;
  }

  toggleWire(): boolean {
    this.isWireActive = !this.isWireActive;
    return this.isWireActive;
  }

  private get isInspectActive(): boolean {
    return (
      this.options.inspect === true || typeof this.options.inspect === "number"
    );
  }

  private send(message: TunnelMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    try {
      let wireData: string;
      if (this.sharedKey) {
        const encrypted = encryptPayload(encode(message), this.sharedKey);
        wireData = encode(encrypted);
      } else {
        wireData = encode(message);
      }
      if (
        this.isInspectActive &&
        this.isWireActive &&
        message.type !== "ping" &&
        message.type !== "pong"
      ) {
        logWire("out", wireData);
      }
      this.socket.send(wireData);
    } catch {
      // Socket send failure
    }
  }

  sendWsData(id: string, data: string, isBinary?: boolean) {
    this.send({
      type: "ws_data",
      id,
      data,
      isBinary,
    });
  }

  sendWsClose(id: string, code?: number, reason?: string) {
    this.send({
      type: "ws_close",
      id,
      code,
      reason,
    });
  }

  async connect(): Promise<TunnelReady> {
    this.stopped = false;
    return this.connectOnce();
  }

  disconnect() {
    this.stopped = true;
    this.isConnected = false;
    this.isWireActive = false;
    this.sharedKey = undefined;
    this.sessionFingerprint = undefined;
    try {
      this.socket?.close(1000, "client_stopped");
    } catch {
      // Ignore
    }
  }

  private connectOnce(): Promise<TunnelReady> {
    return new Promise((resolve, reject) => {
      let isSettled = false;
      let socket: WebSocket;
      let lastServerActivity = Date.now();
      let watchdogTimer: NodeJS.Timeout | undefined;

      const cleanupWatchdog = () => {
        if (watchdogTimer) {
          clearInterval(watchdogTimer);
          watchdogTimer = undefined;
        }
      };

      const startWatchdog = () => {
        cleanupWatchdog();
        lastServerActivity = Date.now();
        watchdogTimer = setInterval(() => {
          if (Date.now() - lastServerActivity > 45_000) {
            cleanupWatchdog();
            try {
              socket.close();
            } catch {
              // Ignore close error
            }
          }
        }, 10_000);
      };

      const shouldEncrypt = this.options.encrypt !== false;
      const keyPair = shouldEncrypt ? generateEcdhKeyPair() : undefined;

      try {
        socket = new WebSocket(this.options.server);
        this.socket = socket;
      } catch (err) {
        reject(new Error(this.formatErrorMessage(err)));
        return;
      }

      socket.addEventListener(
        "open",
        () => {
          startWatchdog();
          socket.send(
            encode({
              type: "hello",
              version: PROTOCOL_VERSION,
              client: "eta",
              token: this.options.token,
              subdomain: this.currentSubdomain,
              tunnelId: this.currentTunnelId,
              publicKey: keyPair?.publicKey,
              auth: this.options.auth,
              allowedIps: this.options.allowedIps,
            }),
          );
        },
        { once: true },
      );

      socket.addEventListener("message", async (event: MessageEvent) => {
        lastServerActivity = Date.now();

        const raw =
          typeof event.data === "string"
            ? event.data
            : event.data instanceof Blob
              ? await event.data.text()
              : event.data;

        let message: TunnelMessage;
        try {
          message = decode(raw);
        } catch {
          return;
        }

        // If inner message is encrypted, decrypt with derived session key
        if (message.type === "encrypted" && this.sharedKey) {
          try {
            const plaintext = decryptPayload(message, this.sharedKey);
            message = decode(plaintext);
          } catch {
            return;
          }
        }

        if (message.type === "ping") {
          this.send({ type: "pong", timestamp: message.timestamp });
          return;
        }

        if (message.type === "pong") {
          return;
        }

        if (this.isInspectActive && this.isWireActive) {
          logWire("in", String(raw));
        }

        if (message.type === "ready") {
          // Key exchange completion
          if (keyPair && message.publicKey) {
            try {
              this.sharedKey = keyPair.computeSharedKey(message.publicKey);
              this.sessionFingerprint = computeFingerprint(
                keyPair.publicKey,
                message.publicKey,
              );
            } catch {
              // Fallback without encryption
            }
          }

          this.isConnected = true;
          this.currentSubdomain = message.subdomain;
          this.currentTunnelId = message.tunnelId;
          const readyWithUrl: TunnelReady = {
            ...message,
            url: message.url,
          };

          if (!isSettled) {
            isSettled = true;
            resolve(readyWithUrl);
          }
          this.readyHandler?.(readyWithUrl);
          return;
        }

        if (message.type === "error") {
          this.stopped = true;
          cleanupWatchdog();
          if (!isSettled) {
            isSettled = true;
            reject(new Error(message.message));
          } else {
            console.error(`\n${message.message}\n`);
            this.disconnect();
          }
          return;
        }

        if (message.type === "ws_open") {
          this.wsOpenHandler?.(message);
          return;
        }

        if (message.type === "ws_data") {
          this.wsDataHandler?.(message);
          return;
        }

        if (message.type === "ws_close") {
          this.wsCloseHandler?.(message);
          return;
        }

        if (message.type === "request") {
          void this.handle(message);
        }
      });

      socket.addEventListener(
        "error",
        (event) => {
          cleanupWatchdog();
          if (!isSettled) {
            isSettled = true;
            reject(new Error(this.formatErrorMessage(event)));
          }
        },
        { once: true },
      );

      socket.addEventListener(
        "close",
        (event: any) => {
          cleanupWatchdog();
          this.sharedKey = undefined;
          if (this.socket !== socket) return;

          const wasConnected = this.isConnected;
          this.isConnected = false;
          this.isWireActive = false;

          // Close code 1008 (Policy Violation / Subdomain in use / Displaced)
          // or 1000 (Normal Closure): do not auto-reconnect!
          if (event && (event.code === 1008 || event.code === 1000)) {
            this.stopped = true;
          }

          if (wasConnected && !this.stopped) {
            this.disconnectHandler?.();
          }

          if (!this.stopped && this.options.reconnect !== false) {
            setTimeout(() => {
              if (this.socket !== socket || this.stopped) return;
              void this.connectOnce().catch(() => {});
            }, this.options.reconnectDelayMs ?? 2000);
          }
        },
        { once: true },
      );
    });
  }

  private formatErrorMessage(err: unknown): string {
    const errorObj = (
      err &&
      typeof err === "object" &&
      "error" in err &&
      (err as { error?: unknown }).error
        ? (err as { error?: unknown }).error
        : err
    ) as {
      code?: string;
      message?: string;
      errors?: Array<{ code?: string; message?: string }>;
    };

    const code = errorObj?.code || errorObj?.errors?.find((e) => e.code)?.code;

    if (code === "ECONNREFUSED") {
      return "- Unable to connect to the tunnel service.\n- Please check your internet connection or try again later.";
    }
    if (code === "ENOTFOUND") {
      return "- Unable to reach the tunnel service.\n- Please check your network connection.";
    }
    if (code === "ETIMEDOUT") {
      return "- Connection to the tunnel service timed out.\n- Please try again.";
    }
    if (errorObj?.message && !errorObj.message.includes("[object")) {
      return errorObj.message;
    }
    return "- Unable to connect to the tunnel service.\n- Please check your internet connection or try again later.";
  }

  private async handle(message: TunnelRequest) {
    if (!this.handler) return;

    const sender: StreamSender = {
      start: (status, headers) => {
        this.send({
          type: "response_start",
          id: message.id,
          status,
          headers,
        });
      },
      chunk: (chunk, isBinary) => {
        this.send({
          type: "response_chunk",
          id: message.id,
          chunk,
          isBinary,
        });
      },
      end: () => {
        this.send({
          type: "response_end",
          id: message.id,
        });
      },
      error: (msg, code, port) => {
        this.send({
          type: "error",
          id: message.id,
          message: msg,
          code,
          port,
        });
      },
    };

    try {
      await this.handler(message, sender);
    } catch (error) {
      sender.error(error instanceof Error ? error.message : "Request failed");
    }
  }
}
