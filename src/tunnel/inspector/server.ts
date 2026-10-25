import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Socket, createServer as createNetServer } from "node:net";
import type { RequestRingBuffer } from "./ring-buffer.js";
import { replayRequest } from "./replay.js";
import { renderInspectorHtml } from "./ui.js";
import { INSPECTOR_PORT } from "../lib/constants.js";

export interface InspectorServerOptions {
  localPort: number;
  ringBuffer: RequestRingBuffer;
  preferredPort?: number;
  publicUrl?: string;
  onReplayResult?: (info: {
    method: string;
    path: string;
    status: number;
    duration: number;
    detail?: string;
  }) => void;
}

export interface InspectorServerInstance {
  port: number;
  url: string;
  setPublicUrl: (url: string) => void;
  close: () => Promise<void>;
}

export async function startInspectorServer(
  options: InspectorServerOptions,
): Promise<InspectorServerInstance> {
  const {
    localPort,
    ringBuffer,
    preferredPort = INSPECTOR_PORT,
    onReplayResult,
  } = options;
  let currentPublicUrl = options.publicUrl || "Connecting...";

  const sseClients = new Set<ServerResponse>();

  // Subscribe to ring buffer updates to push SSE events
  ringBuffer.onUpdate((req) => {
    const payload = `data: ${JSON.stringify({ type: "update", id: req.id })}\n\n`;
    for (const res of sseClients) {
      try {
        res.write(payload);
      } catch {
        sseClients.delete(res);
      }
    }
  });

  const requestHandler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() || "GET";

    // Set CORS headers for local loopback
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (method === "GET" && pathname === "/") {
      const html = renderInspectorHtml({
        port: localPort,
        publicUrl: currentPublicUrl,
      });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (method === "GET" && pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(": keepalive\n\n");
      sseClients.add(res);

      req.on("close", () => {
        sseClients.delete(res);
      });
      return;
    }

    if (method === "GET" && pathname === "/api/requests") {
      const all = ringBuffer.getAll();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(all));
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/requests/")) {
      const id = pathname.slice("/api/requests/".length);
      const entry = ringBuffer.get(id);
      if (!entry) {
        res.writeHead(404, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify({ error: "Request not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(entry));
      return;
    }

    if (
      method === "POST" &&
      pathname.startsWith("/api/requests/") &&
      pathname.endsWith("/replay")
    ) {
      const parts = pathname.split("/");
      const id = parts[3];
      const entry = ringBuffer.get(id);
      if (!entry) {
        res.writeHead(404, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify({ error: "Request not found" }));
        return;
      }

      const result = await replayRequest(entry, localPort, ringBuffer);
      onReplayResult?.({
        method: entry.method,
        path: entry.path,
        status: result.status,
        duration: result.duration,
        detail: result.error,
      });

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
      return;
    }

    if (method === "POST" && pathname === "/api/clear") {
      ringBuffer.clear();
      for (const client of sseClients) {
        try {
          client.write(`data: ${JSON.stringify({ type: "clear" })}\n\n`);
        } catch {
          sseClients.delete(client);
        }
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
  };

function isPortFree(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(200);

    // If connection succeeds, someone is already listening on this port (even if bound to 0.0.0.0)
    socket.once("connect", () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(false);
    });

    socket.once("timeout", () => {
      if (settled) return;
      settled = true;
      cleanup();
      tryBind();
    });

    socket.once("error", () => {
      if (settled) return;
      settled = true;
      cleanup();
      tryBind();
    });

    function tryBind() {
      const tester = createNetServer();
      tester.unref();
      tester.once("error", () => resolve(false));
      tester.listen(port, host, () => {
        tester.close(() => resolve(true));
      });
    }

    socket.connect(port, host);
  });
}

  // Find an available port starting from preferredPort
  let activePort = preferredPort;
  const maxAttempts = 20;
  let boundServer: ReturnType<typeof createServer> | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidatePort = preferredPort + attempt;
    const isFree = await isPortFree(candidatePort, "127.0.0.1");
    if (!isFree) {
      continue;
    }

    const testServer = createServer(requestHandler);
    const isBound = await new Promise<boolean>((resolve) => {
      testServer.once("error", () => resolve(false));
      testServer.listen(candidatePort, "127.0.0.1", () => {
        resolve(true);
      });
    });

    if (isBound) {
      activePort = candidatePort;
      boundServer = testServer;
      break;
    }
  }

  const server = boundServer || createServer(requestHandler);
  if (!boundServer) {
    server.listen(activePort, "127.0.0.1");
  }

  const inspectorUrl = `http://127.0.0.1:${activePort}`;

  return {
    port: activePort,
    url: inspectorUrl,
    setPublicUrl: (url: string) => {
      currentPublicUrl = url;
    },
    close: () => {
      return new Promise<void>((resolve) => {
        for (const res of sseClients) {
          try {
            res.end();
          } catch {
            // Ignore
          }
        }
        sseClients.clear();
        server.close(() => resolve());
      });
    },
  };
}
