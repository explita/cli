import { randomUUID } from "node:crypto";
import type { TunnelRequest } from "@explita/infra-protocol";

export interface RecordedRequest {
  id: string;
  originalId: string;
  timestamp: number;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
  isBinary?: boolean;
  status?: number;
  duration?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  isResponseBinary?: boolean;
  error?: string;
  isReplay?: boolean;
}

export class RequestRingBuffer {
  private readonly items: RecordedRequest[] = [];
  private readonly listeners = new Set<(req: RecordedRequest) => void>();

  constructor(private readonly maxSize = 50) {}

  recordRequest(request: TunnelRequest, isReplay = false): RecordedRequest {
    const entry: RecordedRequest = {
      id: randomUUID(),
      originalId: request.id,
      timestamp: Date.now(),
      method: request.method,
      path: request.path,
      headers: { ...request.headers },
      body: request.body,
      isBinary: request.isBinary,
      isReplay,
    };

    this.items.unshift(entry);
    if (this.items.length > this.maxSize) {
      this.items.pop();
    }

    this.notifyListeners(entry);
    return entry;
  }

  updateResponse(
    originalId: string,
    update: {
      status: number;
      duration: number;
      headers: Record<string, string>;
      body?: string;
      isBinary?: boolean;
    },
  ): RecordedRequest | undefined {
    const entry = this.items.find((item) => item.originalId === originalId);
    if (entry) {
      entry.status = update.status;
      entry.duration = update.duration;
      entry.responseHeaders = { ...update.headers };
      if (update.body !== undefined) {
        entry.responseBody = update.body;
      }
      if (update.isBinary !== undefined) {
        entry.isResponseBinary = update.isBinary;
      }
      this.notifyListeners(entry);
    }
    return entry;
  }

  updateError(
    originalId: string,
    error: string,
    duration: number,
  ): RecordedRequest | undefined {
    const entry = this.items.find((item) => item.originalId === originalId);
    if (entry) {
      entry.status = 502;
      entry.error = error;
      entry.duration = duration;
      this.notifyListeners(entry);
    }
    return entry;
  }

  getAll(): RecordedRequest[] {
    return [...this.items];
  }

  get(id: string): RecordedRequest | undefined {
    return this.items.find((item) => item.id === id || item.originalId === id);
  }

  getLast(): RecordedRequest | undefined {
    return this.items[0];
  }

  clear(): void {
    this.items.length = 0;
  }

  onUpdate(listener: (req: RecordedRequest) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(req: RecordedRequest): void {
    for (const listener of this.listeners) {
      try {
        listener(req);
      } catch {
        // Ignore listener error
      }
    }
  }
}
