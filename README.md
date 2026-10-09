# AIcopilot

![AIcopilot 封面 Logo：麦穗与 DNA 双螺旋](assets/aicopilot-readme-cover.png)

AIcopilot 是一个可运行的作物遗传育种研究助手 Demo，包含 React 前端和 Python LangGraph 后端。研究 Agent 可以检索文献、回答群体结构分析（PCA）、基因组选择（GS）、GWAS 等问题，并生成带引用的 Markdown 报告；独立的 GS 演示可在浏览器内分析本地 CSV。请核对报告中的文献与结论。

## 快速启动

### 1. 准备环境

需要 Python 3.12+、[uv](https://docs.astral.sh/uv/)、Node.js 与 npm，以及一个可用的模型 API Key 和 [Tavily API Key](https://app.tavily.com/)。在项目根目录执行：

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
uv sync
npm ci --prefix frontend
```

### 2. 配置密钥

编辑根目录的 `.env`。最简单的配置是使用 OpenAI：

```dotenv
AGENTSEEK_MODEL_PROVIDER=openai
AGENTSEEK_MODEL=gpt-4.1-mini
OPENAI_API_KEY=你的模型_API_Key
OPENAI_API_BASE=
TAVILY_API_KEY=你的_Tavily_API_Key
```

如果使用 OpenAI 兼容服务，请把 `AGENTSEEK_MODEL` 改成该服务支持的模型 ID，并填写 `OPENAI_API_BASE`。项目也支持 Anthropic 和 Google 模型；对应变量见 [.env.example](.env.example)。不要提交含真实密钥的 `.env`。

本机运行时，`frontend/.env` 保持默认值即可：

```dotenv
VITE_LANGGRAPH_API_URL=http://127.0.0.1:2026
```

如果你在另一台设备的浏览器访问前端，请把这里改成**浏览器能够访问**的后端地址，修改后重启服务。

### 3. 启动并使用

```bash
uvx agentseek dev
```

在浏览器打开 **http://127.0.0.1:1996/**。启动器会运行前端和位于 **http://127.0.0.1:2026/** 的后端；终端保持运行。首次启动可能需要下载依赖。

可以点击首页的示例问题，也可以直接输入：

> 请介绍作物群体 PCA 分析中如何筛选标记、确定保留的主成分数，以及如何在 GWAS 中校正群体分层。请给出可核查的文献引用。

对话区展示最终回答；报告也可在右侧结果面板查看。任务进行时只显示整体状态，不展示内部规划、搜索或工具调用。研究任务可能需要几分钟。停止服务时在启动终端按 `Ctrl+C`。

要试用本地基因组预测，打开右侧的 **GS 基因组预测**，点击“用示例数据运行”，或分别选择基因型和表型 CSV。此功能在浏览器内计算 GBLUP、PCC 和 RMSE，数据不会上传给研究 Agent。建议不超过 200 个样本、5000 个标记。

## 常见问题

| 现象 | 检查方式 |
| --- | --- |
| 页面无法连接后端 | 确认 `agentseek dev` 仍在运行；检查 `frontend/.env` 中的 `VITE_LANGGRAPH_API_URL` 是否能从当前浏览器访问。 |
| 模型请求失败 | 检查 `.env` 中的模型提供商、模型 ID、API Key 和兼容服务地址是否匹配；修改后重启服务。 |
| 检索失败或没有文献 | 检查 `TAVILY_API_KEY` 及其额度；报告中的引用仍需人工核对。 |
| 端口已占用 | 关闭占用 1996 或 2026 端口的旧服务，再重新启动。 |
| 任务运行较久 | 默认单个研究子任务最多运行 600 秒，可通过 `.env` 中的 `AICOPILOT_SUBAGENT_TIMEOUT_S` 调整。 |

会话检查点默认保存在 `~/.agentseek/aicopilot/seekdb`。如需更换目录，修改 `.env` 中的 `SEEKDB_EMBED_DIR`。

## 开发与验证

```bash
uv run python -m pytest -q
cd frontend
npm test
npm run build
```

`npm test` 包含真实后端的契约测试，运行前请先启动服务。源码位置：后端在 `src/aicopilot/`，前端在 `frontend/src/`，服务配置在 `.agentseek/lifecycle.toml`。

## 发布前注意

提交前使用 `git status --short` 核对文件列表。`.env`、`frontend/.env`、依赖目录、运行数据和研究计划均不应提交；示例配置文件 `.env.example` 可以提交，但不要把真实密钥写进去。
