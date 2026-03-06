import type { AppConfig } from './types.ts';

let config: AppConfig | undefined;

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

function getEnv(name: string): string | undefined {
  const value = Deno.env.get(name);
  return value === undefined || value === '' ? undefined : value;
}

function parseIntEnv(name: string): number | undefined {
  const value = getEnv(name);
  if (!value) return undefined;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolEnv(name: string): boolean | undefined {
  const value = getEnv(name)?.toLowerCase();
  if (!value) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return undefined;
}

function decodeBase64Json(encoded: string): Record<string, unknown> | null {
  try {
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0
      ? ''
      : '='.repeat(4 - (normalized.length % 4));
    const bytes = Uint8Array.from(
      atob(normalized + padding),
      (char) => char.charCodeAt(0),
    );
    const decoded = new TextDecoder().decode(bytes);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch (error) {
    console.warn('[Config] 解析 FP 环境变量失败:', error);
    return null;
  }
}

export function getConfig(): AppConfig {
  if (config) return config;

  config = {
    port: parseIntEnv('PORT') ?? 3010,
    timeout: parseIntEnv('TIMEOUT') ?? 120,
    cursorModel: getEnv('CURSOR_MODEL') ?? 'anthropic/claude-sonnet-4.6',
    fingerprint: {
      userAgent: getEnv('FINGERPRINT_USER_AGENT') ?? DEFAULT_USER_AGENT,
    },
  };

  const proxy = getEnv('PROXY');
  if (proxy) {
    config.proxy = proxy;
  }

  const apiKey = getEnv('API_KEY');
  if (apiKey) {
    config.auth = {
      apiKey,
    };
  }

  const hasVisionEnv = [
    'VISION_ENABLED',
    'VISION_MODE',
    'VISION_BASE_URL',
    'VISION_API_KEY',
    'VISION_MODEL',
  ].some((name) => getEnv(name) !== undefined);

  if (hasVisionEnv) {
    const mode = getEnv('VISION_MODE');
    config.vision = {
      enabled: parseBoolEnv('VISION_ENABLED') ?? true,
      mode: mode === 'ocr' ? 'ocr' : 'api',
      baseUrl: getEnv('VISION_BASE_URL') ??
        'https://api.openai.com/v1/chat/completions',
      apiKey: getEnv('VISION_API_KEY') ?? '',
      model: getEnv('VISION_MODEL') ?? 'gpt-4o-mini',
    };
  }

  const encodedFingerprint = getEnv('FP');
  if (encodedFingerprint) {
    const fingerprint = decodeBase64Json(encodedFingerprint);
    if (
      typeof fingerprint?.userAgent === 'string' && fingerprint.userAgent.trim()
    ) {
      config.fingerprint.userAgent = fingerprint.userAgent;
    }
  }

  return config;
}
