# Cursor2API for Deno Deploy

把 Cursor Docs AI 的接口代理为兼容 **Anthropic Messages API** 与 **OpenAI Chat
Completions API** 的服务，并改造成适合直接部署到 **Deno Deploy** 的版本。

## 这次重构做了什么

- 从 `Express` 入口改为标准 Web `Request -> Response`
- 使用 `Deno.serve(...)` 启动，适配 `Deno Deploy`
- 去掉 `fs` / `process.env` / `Buffer` / `uuid` 等 Node 运行时耦合
- 配置方式改为 **环境变量优先**
- 保留 Anthropic / OpenAI 兼容路由与 SSE 流式返回
- 图片处理改为 **Deno Deploy 友好** 模式：
  - `VISION_MODE=api`：调用外部视觉模型
  - `VISION_MODE=ocr`：不再运行本地 `tesseract.js`，会返回明确降级说明

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

3. 启动开发服务

```bash
deno task dev --env-file=.env
```

如果你的本地 Deno 版本不支持把 `--env-file` 透传给 task，也可以直接运行：

```bash
deno run --allow-env --allow-net --env-file=.env --watch src/index.ts
```

## 部署到 Deno Deploy

### 方式一：直接连接 GitHub 仓库

- Framework Preset 选择 `Deno`
- Entrypoint 填 `src/index.ts`
- 在项目设置里配置环境变量

### 方式二：使用 `deployctl`

```bash
deployctl deploy --project=<你的项目名> --entrypoint=src/index.ts
```

## 环境变量

### 基础配置

- `PORT`：本地运行端口，默认 `3010`
- `TIMEOUT`：请求超时秒数，默认 `120`
- `CURSOR_MODEL`：发给 Cursor 的模型名
- `FINGERPRINT_USER_AGENT`：模拟浏览器请求头
- `FP`：可选，Base64 编码的指纹 JSON，会覆盖 `FINGERPRINT_USER_AGENT`

### 视觉配置

- `VISION_ENABLED`：是否启用图片预处理
- `VISION_MODE`：`api` 或 `ocr`
- `VISION_BASE_URL`：外部视觉模型接口地址
- `VISION_API_KEY`：外部视觉模型密钥
- `VISION_MODEL`：外部视觉模型名

> 注意：`Deno Deploy` 版本不再支持原项目里的本地 `tesseract.js` OCR
> worker。要处理图片，请优先使用 `VISION_MODE=api`。

## 使用示例

### Claude Code

```bash
export ANTHROPIC_BASE_URL=https://your-project.deno.dev
```

### OpenAI 兼容客户端

```bash
export OPENAI_BASE_URL=https://your-project.deno.dev/v1
```

## 项目结构

```text
src/
├── index.ts            # Deno Deploy 入口与路由
├── http.ts             # Web Response 适配层
├── config.ts           # 环境变量配置
├── cursor-client.ts    # Cursor API 客户端
├── converter.ts        # 协议转换
├── handler.ts          # Anthropic 兼容处理
├── openai-handler.ts   # OpenAI 兼容处理
├── vision.ts           # Deploy 友好的图片预处理
├── types.ts
└── openai-types.ts
```

## 验证

```bash
deno task check
```

## 兼容性说明

- 这是一个 **Deno Deploy 优先** 的版本
- 当前仓库只保留 Deno Deploy 所需的代码和配置
