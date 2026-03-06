# Cursor2API for Deno Deploy

这是一个面向 `Deno Deploy` 的代理服务，把 Cursor Docs AI 的接口转换为兼容：

- `Anthropic Messages API`
- `OpenAI Chat Completions API`

## 特性

- 使用 `Deno.serve(...)` 启动
- 使用标准 Web `Request -> Response`
- 保留 Anthropic / OpenAI 兼容接口
- 支持 SSE 流式响应
- 支持通过环境变量开启 API Key 鉴权
- 支持外部视觉模型 API

## 路由

- `POST /v1/messages`
- `POST /messages`
- `POST /v1/chat/completions`
- `POST /chat/completions`
- `POST /v1/messages/count_tokens`
- `POST /messages/count_tokens`
- `GET /v1/models`
- `GET /health`
- `GET /`

## 本地运行

1. 安装 Deno 2
2. 复制环境变量模板

```bash
cp .env.example .env
```

3. 启动

```bash
deno run --allow-env --allow-net --env-file=.env --watch src/index.ts
```

如果你使用 task，也可以直接运行：

```bash
deno task dev
```

## 部署到 Deno Deploy

- Framework Preset 选择 `Deno`
- Entrypoint 填 `src/index.ts`
- 在项目后台配置环境变量

## 环境变量

### 基础配置

- `TIMEOUT`：请求超时秒数，默认 `120`
- `CURSOR_MODEL`：发给 Cursor 的模型名
- `FINGERPRINT_USER_AGENT`：模拟浏览器请求头
- `FP`：可选，Base64 编码 JSON，会覆盖 `FINGERPRINT_USER_AGENT`

### 访问鉴权

- `API_KEY`：可选，给你的代理服务本身加访问密钥
- 未配置 `API_KEY` 时，接口默认不鉴权
- 配置 `API_KEY` 后，除 `GET /` 和 `GET /health` 外，其余接口都需要鉴权

支持两种传递方式：

- `Authorization: Bearer <API_KEY>`
- `x-api-key: <API_KEY>`

示例：

```bash
curl https://your-project.deno.dev/v1/models \
  -H "Authorization: Bearer your-secret-key"
```

### 视觉配置

- `VISION_ENABLED`：是否启用图片预处理
- `VISION_MODE`：`api` 或 `ocr`
- `VISION_BASE_URL`：外部视觉模型接口地址
- `VISION_API_KEY`：外部视觉模型密钥
- `VISION_MODEL`：外部视觉模型名

注意：

- 当前 `Deno Deploy` 版本不再支持原项目里的本地 `tesseract.js` OCR worker
- 要处理图片，请优先使用 `VISION_MODE=api`
- 当前 `VISION_MODE=ocr` 只会返回降级说明，不会真的执行本地 OCR

## 使用示例

### Claude Code

```bash
export ANTHROPIC_BASE_URL=https://your-project.deno.dev
```

### OpenAI 兼容客户端

```bash
export OPENAI_BASE_URL=https://your-project.deno.dev/v1
```

### OpenAI 兼容客户端 + API Key

```bash
curl https://your-project.deno.dev/v1/chat/completions \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"hello\"}]}"
```

## 项目结构

```text
src/
├── index.ts
├── http.ts
├── config.ts
├── cursor-client.ts
├── converter.ts
├── handler.ts
├── openai-handler.ts
├── vision.ts
├── types.ts
└── openai-types.ts
```

## 验证

```bash
deno task check
deno lint
```
