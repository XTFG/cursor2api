export interface AppRequest {
  method: string;
  url: string;
  path: string;
  headers: Headers;
  body?: unknown;
}

export interface AppResponse {
  status(code: number): AppResponse;
  json(data: unknown): void;
  writeHead(status: number, headers: Record<string, string>): void;
  write(chunk: string): void;
  end(chunk?: string): void;
  flush(): void;
}

export type RouteHandler = (
  req: AppRequest,
  res: AppResponse,
) => void | Promise<void>;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function withCors(headers?: HeadersInit): Headers {
  const merged = new Headers(headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    merged.set(key, value);
  }
  return merged;
}

export function jsonResponse(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  const merged = withCors(headers);
  if (!merged.has('Content-Type')) {
    merged.set('Content-Type', 'application/json; charset=utf-8');
  }
  return new Response(JSON.stringify(data), { status, headers: merged });
}

export function emptyResponse(status = 200, headers?: HeadersInit): Response {
  return new Response(null, { status, headers: withCors(headers) });
}

export function methodNotAllowed(allowed: string[]): Response {
  return jsonResponse(
    {
      type: 'error',
      error: {
        type: 'method_not_allowed',
        message: `Method not allowed. Expected: ${allowed.join(', ')}`,
      },
    },
    405,
    { Allow: allowed.join(', ') },
  );
}

export function notFoundResponse(): Response {
  return jsonResponse(
    {
      type: 'error',
      error: {
        type: 'not_found',
        message: 'Route not found',
      },
    },
    404,
  );
}

export async function parseJsonBody<T>(
  request: Request,
  maxBytes: number,
): Promise<T> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength) {
    const length = Number(declaredLength);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new HttpError(
        413,
        `Request body too large. Maximum is ${maxBytes} bytes.`,
      );
    }
  }

  const raw = await request.text();
  const byteLength = new TextEncoder().encode(raw).byteLength;
  if (byteLength > maxBytes) {
    throw new HttpError(
      413,
      `Request body too large. Maximum is ${maxBytes} bytes.`,
    );
  }

  if (!raw.trim()) {
    throw new HttpError(400, 'Request body is required.');
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

export function createResponseAdapter(): {
  response: AppResponse;
  toResponse: () => Promise<Response>;
} {
  const encoder = new TextEncoder();
  const headers = withCors();
  let statusCode = 200;
  let ended = false;
  let started = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const pendingChunks: string[] = [];

  let resolveResponse: ((response: Response) => void) | undefined;
  const responsePromise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });

  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;

      for (const chunk of pendingChunks) {
        streamController.enqueue(encoder.encode(chunk));
      }
      pendingChunks.length = 0;

      if (ended) {
        streamController.close();
      }
    },
  });

  const ensureStreamStarted = () => {
    if (started) return;
    started = true;
    resolveResponse?.(new Response(stream, { status: statusCode, headers }));
  };

  const writeChunk = (chunk: string) => {
    ensureStreamStarted();
    if (controller) {
      controller.enqueue(encoder.encode(chunk));
      return;
    }
    pendingChunks.push(chunk);
  };

  const finalize = () => {
    if (ended) return;
    ended = true;

    if (started) {
      controller?.close();
      return;
    }

    resolveResponse?.(new Response(null, { status: statusCode, headers }));
  };

  const response: AppResponse = {
    status(code: number): AppResponse {
      statusCode = code;
      return response;
    },

    json(data: unknown): void {
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json; charset=utf-8');
      }
      writeChunk(JSON.stringify(data));
      ended = true;
      controller?.close();
    },

    writeHead(status: number, nextHeaders: Record<string, string>): void {
      statusCode = status;
      for (const [key, value] of Object.entries(nextHeaders)) {
        headers.set(key, value);
      }
      ensureStreamStarted();
    },

    write(chunk: string): void {
      writeChunk(chunk);
    },

    end(chunk?: string): void {
      if (chunk) {
        writeChunk(chunk);
      }
      finalize();
    },

    flush(): void {
      // Web Streams are flushed by the runtime automatically.
    },
  };

  return {
    response,
    toResponse: () => {
      if (!started && !ended) {
        finalize();
      }
      return responsePromise;
    },
  };
}
