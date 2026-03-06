import { getConfig } from './config.ts';
import { countTokens, handleMessages, listModels } from './handler.ts';
import { handleOpenAIChatCompletions } from './openai-handler.ts';
import type { AppRequest, RouteHandler } from './http.ts';
import {
  createResponseAdapter,
  emptyResponse,
  HttpError,
  jsonResponse,
  methodNotAllowed,
  notFoundResponse,
  parseJsonBody,
} from './http.ts';

const MAX_JSON_BODY_BYTES = 50 * 1024 * 1024;
const VERSION = '3.0.0';

function normalizePath(pathname: string): string {
  if (pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

function isPublicPath(path: string): boolean {
  return path === '/' || path === '/health';
}

function extractRequestApiKey(request: Request): string | undefined {
  const authorization = request.headers.get('authorization');
  if (authorization) {
    const [scheme, credentials] = authorization.split(/\s+/, 2);
    if (
      scheme?.toLowerCase() === 'bearer' &&
      credentials &&
      credentials.trim()
    ) {
      return credentials.trim();
    }
  }

  const headerApiKey = request.headers.get('x-api-key');
  if (headerApiKey?.trim()) {
    return headerApiKey.trim();
  }

  return undefined;
}

function unauthorizedResponse(): Response {
  return jsonResponse(
    {
      type: 'error',
      error: {
        type: 'authentication_error',
        message:
          'Invalid or missing API key. Use Authorization: Bearer <API_KEY> or x-api-key.',
      },
    },
    401,
    {
      'WWW-Authenticate': 'Bearer',
    },
  );
}

function authGuard(request: Request, path: string): Response | null {
  const expectedApiKey = getConfig().auth?.apiKey;

  if (!expectedApiKey || isPublicPath(path)) {
    return null;
  }

  const actualApiKey = extractRequestApiKey(request);
  if (actualApiKey === expectedApiKey) {
    return null;
  }

  return unauthorizedResponse();
}

function buildAppRequest(
  request: Request,
  path: string,
  body?: unknown,
): AppRequest {
  return {
    method: request.method,
    url: request.url,
    path,
    headers: request.headers,
    body,
  };
}

async function runHandler(
  request: Request,
  path: string,
  handler: RouteHandler,
  body?: unknown,
): Promise<Response> {
  const { response, toResponse } = createResponseAdapter();
  await handler(buildAppRequest(request, path, body), response);
  return await toResponse();
}

async function runJsonHandler(
  request: Request,
  path: string,
  handler: RouteHandler,
): Promise<Response> {
  const body = await parseJsonBody(request, MAX_JSON_BODY_BYTES);
  return await runHandler(request, path, handler, body);
}

function methodGuard(request: Request, allowed: string[]): Response | null {
  return allowed.includes(request.method) ? null : methodNotAllowed(allowed);
}

function rootResponse(request: Request): Response {
  const origin = new URL(request.url).origin;
  const config = getConfig();

  return jsonResponse({
    name: 'cursor2api',
    version: VERSION,
    runtime: 'deno-deploy',
    description: 'Cursor Docs AI → Anthropic & OpenAI API Proxy',
    endpoints: {
      anthropic_messages: 'POST /v1/messages',
      openai_chat: 'POST /v1/chat/completions',
      models: 'GET /v1/models',
      health: 'GET /health',
    },
    usage: {
      claude_code: `export ANTHROPIC_BASE_URL=${origin}`,
      openai_compatible: `OPENAI_BASE_URL=${origin}/v1`,
      cursor_model: config.cursorModel,
    },
  });
}

async function handleRequest(request: Request): Promise<Response> {
  const path = normalizePath(new URL(request.url).pathname);

  if (request.method === 'OPTIONS') {
    return emptyResponse(200);
  }

  try {
    if (path === '/') {
      const blocked = methodGuard(request, ['GET']);
      return blocked ?? rootResponse(request);
    }

    if (path === '/health') {
      const blocked = methodGuard(request, ['GET']);
      return blocked ??
        jsonResponse({
          status: 'ok',
          version: VERSION,
          runtime: 'deno-deploy',
        });
    }

    const unauthorized = authGuard(request, path);
    if (unauthorized) {
      return unauthorized;
    }

    if (path === '/v1/models') {
      const blocked = methodGuard(request, ['GET']);
      return blocked ?? await runHandler(request, path, listModels);
    }

    if (path === '/v1/messages' || path === '/messages') {
      const blocked = methodGuard(request, ['POST']);
      return blocked ?? await runJsonHandler(request, path, handleMessages);
    }

    if (path === '/v1/chat/completions' || path === '/chat/completions') {
      const blocked = methodGuard(request, ['POST']);
      return blocked ??
        await runJsonHandler(request, path, handleOpenAIChatCompletions);
    }

    if (
      path === '/v1/messages/count_tokens' || path === '/messages/count_tokens'
    ) {
      const blocked = methodGuard(request, ['POST']);
      return blocked ?? await runJsonHandler(request, path, countTokens);
    }

    return notFoundResponse();
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(
        {
          type: 'error',
          error: {
            type: 'request_error',
            message: error.message,
          },
        },
        error.status,
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error('[Server] 请求处理失败:', message);
    return jsonResponse(
      {
        type: 'error',
        error: {
          type: 'server_error',
          message,
        },
      },
      500,
    );
  }
}

Deno.serve(handleRequest);
