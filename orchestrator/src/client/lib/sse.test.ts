import {
  __resetApiClientAuthForTests,
  __setAuthTokenForTests,
  __setLegacyAuthCredentialsForTests,
} from "@client/api/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeToEventSource } from "./sse";

const { redirectToSignIn } = vi.hoisted(() => ({
  redirectToSignIn: vi.fn(),
}));

vi.mock("./auth-navigation", () => ({
  redirectToSignIn,
}));

function createStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
  } as Response;
}

describe("subscribeToEventSource", () => {
  afterEach(() => {
    __resetApiClientAuthForTests();
    vi.restoreAllMocks();
    redirectToSignIn.mockReset();
  });

  it("retries with a bearer token after silently upgrading legacy credentials", async () => {
    const encoder = new TextEncoder();
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    const onError = vi.fn();

    __setLegacyAuthCredentialsForTests({
      username: "shaheer",
      password: "secret",
    });

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        body: null,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            data: { token: "stream-token", expiresIn: 86400 },
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"step":"crawling","message":"Working"}\n\n',
              ),
            );
            controller.close();
          },
        }),
      } as Response);

    const unsubscribe = subscribeToEventSource("/api/pipeline/progress", {
      onOpen,
      onMessage,
      onError,
    });

    await vi.waitFor(() => {
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith({
        step: "crawling",
        message: "Working",
      });
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[2]?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer stream-token",
      },
    });
    expect(onError).not.toHaveBeenCalled();
    expect(redirectToSignIn).not.toHaveBeenCalled();

    unsubscribe();
  });

  it("parses CRLF-delimited SSE frames", async () => {
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    const onError = vi.fn();

    __setAuthTokenForTests("stream-token");

    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createStreamResponse([
        'data: {"step":"crawling","message":"Working"}\r\n\r\n',
      ]),
    );

    subscribeToEventSource("/api/pipeline/progress", {
      onOpen,
      onMessage,
      onError,
    });

    await vi.waitFor(() => {
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith({
        step: "crawling",
        message: "Working",
      });
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it("yields to the event loop between chunks so input/paint can run (does not pin the main thread)", async () => {
    // Regression: under the high-frequency crawlingUpdate flood during
    // discovery, frames arrive across many reader.read() chunks. Previously
    // the read loop processed every chunk back-to-back without yielding,
    // saturating the main thread so Cancel/Sign-Out clicks never fired.
    // The fix yields to the event loop after each chunk.
    __setAuthTokenForTests("stream-token");

    // 3 chunks, 10 frames each, delivered across separate reads.
    const chunks = Array.from({ length: 3 }, (_, ci) =>
      Array.from({ length: 10 }, (_, fi) =>
        `data: {"step":"crawling","message":"tick ${ci}-${fi}"}\n\n`,
      ).join(""),
    );

    let yieldObserved = false;
    const onMessage = vi.fn((payload: { message?: string }) => {
      if (payload.message === "tick 0-0") {
        // Macrotask scheduled during the first chunk's first frame. If the loop
        // yields between chunks, this runs before chunk 2's frames; if it
        // processes all 30 frames synchronously, onMessage has 30 calls here.
        setTimeout(() => {
          yieldObserved = onMessage.mock.calls.length < 30;
        }, 0);
      }
    });

    vi.spyOn(global, "fetch").mockResolvedValueOnce(createStreamResponse(chunks));

    subscribeToEventSource("/api/pipeline/progress", {
      onMessage,
      onError: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(onMessage).toHaveBeenCalledTimes(30);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(yieldObserved).toBe(true);
  });

  it("ignores heartbeat comments and parses trailing frames on close", async () => {
    const onOpen = vi.fn();
    const onMessage = vi.fn();
    const onError = vi.fn();

    __setAuthTokenForTests("stream-token");

    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createStreamResponse([
        ": heartbeat\n\n",
        'data: {"step":"processing","message":"Halfway"}',
      ]),
    );

    subscribeToEventSource("/api/pipeline/progress", {
      onOpen,
      onMessage,
      onError,
    });

    await vi.waitFor(() => {
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith({
        step: "processing",
        message: "Halfway",
      });
    });

    expect(onError).not.toHaveBeenCalled();
  });
});
