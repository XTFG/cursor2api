import { getConfig } from './config.ts';
import type { AnthropicContentBlock, AnthropicMessage } from './types.ts';

export async function applyVisionInterceptor(
  messages: AnthropicMessage[],
): Promise<void> {
  const config = getConfig();
  if (!config.vision?.enabled) return;

  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue;

    let hasImages = false;
    const newContent: AnthropicContentBlock[] = [];
    const imagesToAnalyze: AnthropicContentBlock[] = [];

    for (const block of msg.content) {
      if (block.type === 'image') {
        hasImages = true;
        imagesToAnalyze.push(block);
      } else {
        newContent.push(block);
      }
    }

    if (!hasImages || imagesToAnalyze.length === 0) continue;

    try {
      const descriptions = config.vision.mode === 'api'
        ? await callVisionAPI(imagesToAnalyze)
        : buildOcrUnsupportedText(imagesToAnalyze);

      newContent.push({
        type: 'text',
        text:
          `\n\n[System: The user attached ${imagesToAnalyze.length} image(s). Vision preprocessing extracted the following context:\n${descriptions}]\n\n`,
      });

      msg.content = newContent;
    } catch (error) {
      console.error('[Vision] 处理图片失败:', error);
      newContent.push({
        type: 'text',
        text:
          `\n\n[System: The user attached image(s), but the Deno Deploy vision interceptor failed. Error: ${
            (error as Error).message
          }]\n\n`,
      });
      msg.content = newContent;
    }
  }
}

function buildOcrUnsupportedText(imageBlocks: AnthropicContentBlock[]): string {
  const details = imageBlocks.map((imageBlock, index) => {
    const sourceType = imageBlock.source?.type === 'url'
      ? 'remote_url'
      : 'base64';
    const mediaType = imageBlock.source?.media_type ?? 'image/jpeg';
    return `- Image ${
      index + 1
    }: source=${sourceType}, media_type=${mediaType}`;
  }).join('\n');

  return [
    'The current runtime is Deno Deploy, which does not run the local Tesseract OCR worker used by the original Node.js version.',
    'If you need image understanding, set `VISION_MODE=api` and configure `VISION_BASE_URL`, `VISION_MODEL`, and optionally `VISION_API_KEY`.',
    'The following images were attached but could not be analyzed locally:',
    details,
  ].join('\n');
}

async function callVisionAPI(
  imageBlocks: AnthropicContentBlock[],
): Promise<string> {
  const config = getConfig().vision!;

  const parts: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text:
        'Please describe the attached images in detail. If they contain code, UI elements, or error messages, explicitly transcribe them.',
    },
  ];

  for (const imageBlock of imageBlocks) {
    if (imageBlock.type !== 'image' || !imageBlock.source?.data) continue;

    let url = '';
    if (imageBlock.source.type === 'base64') {
      const mime = imageBlock.source.media_type || 'image/jpeg';
      url = `data:${mime};base64,${imageBlock.source.data}`;
    } else if (imageBlock.source.type === 'url') {
      url = imageBlock.source.data;
    }

    if (url) {
      parts.push({ type: 'image_url', image_url: { url } });
    }
  }

  const headers = new Headers({
    'Content-Type': 'application/json',
  });
  if (config.apiKey) {
    headers.set('Authorization', `Bearer ${config.apiKey}`);
  }

  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: parts }],
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Vision API returned status ${response.status}: ${await response.text()}`,
    );
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  return data.choices?.[0]?.message?.content || 'No description returned.';
}
