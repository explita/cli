import { randomUUID } from "node:crypto";
import { HOP_BY_HOP_HEADERS } from "@explita/infra-protocol";
import type { RequestRingBuffer, RecordedRequest } from "./ring-buffer.js";
import { extractTargetErrorDetails } from "../core/agent.js";

export interface ReplayResult {
  status: number;
  duration: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
  recordedId: string;
}

export async function replayRequest(
  request: RecordedRequest,
  localPort: number,
  ringBuffer?: RequestRingBuffer,
): Promise<ReplayResult> {
  const replayId = `replay_${randomUUID().slice(0, 8)}`;
  const targetUrl = new URL(request.path, `http://localhost:${localPort}`);

  const reqHeaders = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    const lower = key.toLowerCase();
    if (
      !["connection", "accept-encoding", "content-length", "host"].includes(
        lower,
      ) &&
      !HOP_BY_HOP_HEADERS.has(lower)
    ) {
      reqHeaders.set(key, value);
    }
  }

  reqHeaders.set("host", `localhost:${localPort}`);
  reqHeaders.set("x-explita-replay", "true");

  let reqBody: BodyInit | undefined = undefined;
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.body != null
  ) {
    reqBody = request.isBinary
      ? Buffer.from(request.body, "base64")
      : request.body;
  }

  if (ringBuffer) {
    ringBuffer.recordRequest(
      {
        type: "request",
        id: replayId,
        method: request.method,
        path: request.path,
        headers: Object.fromEntries(reqHeaders.entries()),
        body: request.body,
        isBinary: request.isBinary,
      },
      true,
    );
  }

  const start = Date.now();

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: reqHeaders,
      body: reqBody,
      redirect: "manual",
    });

    const duration = Date.now() - start;
    const resHeaders: Record<string, string> = {};
    for (const [key, value] of response.headers.entries()) {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
        resHeaders[key] = value;
      }
    }

    const ctype = (resHeaders["content-type"] || "").toLowerCase();
    const isText =
      ctype.includes("json") ||
      ctype.includes("text") ||
      ctype.includes("xml") ||
      ctype.includes("html") ||
      ctype.includes("javascript") ||
      ctype.includes("css") ||
      ctype.includes("svg") ||
      ctype.includes("form-urlencoded");

    let responseBodyText: string;
    let isResponseBinary = false;

    if (isText) {
      responseBodyText = await response.text();
    } else {
      const arrayBuffer = await response.arrayBuffer();
      responseBodyText = Buffer.from(arrayBuffer).toString("base64");
      isResponseBinary = true;
    }

    if (ringBuffer) {
      ringBuffer.updateResponse(replayId, {
        status: response.status,
        duration,
        headers: resHeaders,
        body: responseBodyText,
        isBinary: isResponseBinary,
      });
    }

    return {
      status: response.status,
      duration,
      headers: resHeaders,
      body: responseBodyText,
      recordedId: replayId,
    };
  } catch (err) {
    const duration = Date.now() - start;
    const { message: errorMessage, shortCode } = extractTargetErrorDetails(
      err,
      localPort,
    );

    if (ringBuffer) {
      ringBuffer.updateError(replayId, shortCode || errorMessage, duration);
    }

    return {
      status: 502,
      duration,
      headers: {},
      body: `Error: ${errorMessage}`,
      error: shortCode || errorMessage,
      recordedId: replayId,
    };
  }
}
