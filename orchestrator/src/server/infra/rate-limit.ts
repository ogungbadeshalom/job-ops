import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getRequestId } from "./request-context";

export type RateLimitOptions = {
  windowMs: number;
  max: number;
  message: string;
  /**
   * Optional key extractor. Defaults to the request IP (req.ip or socket
   * remoteAddress). Use this to scope limits by tenant, user, or other context.
   */
  key?: (req: Request) => string;
};

/**
 * Lightweight in-memory rate limiter. Intended for auth and high-level
 * operational guards where a simple windowed counter is sufficient.
 *
 * Note: the hit store is global to the process and not shared across
 * instances. Per AGENTS.md, tenant/workspace-scoped limits must include the
 * tenant in the key (see the `key` option).
 */
export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = opts.key
      ? opts.key(req)
      : req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count++;

    if (entry.count > opts.max) {
      return res.status(429).json({
        ok: false,
        error: { code: "RATE_LIMITED", message: opts.message },
        meta: { requestId: getRequestId() },
      });
    }

    next();
  };
}
