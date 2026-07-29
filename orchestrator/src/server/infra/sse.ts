import type { Response } from "express";

interface SetupSseOptions {
  cacheControl?: string;
  disableBuffering?: boolean;
  flushHeaders?: boolean;
}

const DEFAULT_HEARTBEAT_MS = 30_000;

export function setupSse(res: Response, options: SetupSseOptions = {}): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", options.cacheControl ?? "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (options.disableBuffering) {
    res.setHeader("X-Accel-Buffering", "no");
  }

  if (options.flushHeaders) {
    res.flushHeaders?.();
  }
}

export function writeSseData(res: Response, data: unknown): boolean {
  // Backpressure-safe + error-guarded SSE write. A slow/disconnected client can
  // make res.write() return false (internal buffer full) or throw (socket
  // already closed). Ignoring that previously grew the server buffer unbounded
  // and could throw uncaught, killing the SSE stream. Callers should stop
  // writing to a response once this returns false.
  if (res.writableEnded || res.destroyed) return false;
  try {
    return res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    return false;
  }
}

export function writeSseComment(res: Response, comment: string): boolean {
  if (res.writableEnded || res.destroyed) return false;
  try {
    return res.write(`: ${comment}\n\n`);
  } catch {
    return false;
  }
}

export function startSseHeartbeat(
  res: Response,
  intervalMs = DEFAULT_HEARTBEAT_MS,
): () => void {
  const heartbeat = setInterval(() => {
    writeSseComment(res, "heartbeat");
  }, intervalMs);

  return () => {
    clearInterval(heartbeat);
  };
}
