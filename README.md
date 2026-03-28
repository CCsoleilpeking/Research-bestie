# ResearchBestie

[English](#english) | [中文](#中文)

## Demo

https://github.com/user-attachments/assets/1e011633-fbe8-4412-a8e9-4a75393d6143

---

## English

A research companion web app that helps you read, discuss, and organize academic papers using LLMs.

### Features

- **Multi-LLM Support** — Connect to OpenAI, Claude, DeepSeek, Kimi, Gemini, or io.net with your own API key
- **Web Search** — Backend automatically searches the web (via Exa AI) when the LLM needs external information, with trusted academic domain prioritization
- **Research Chat** — Discuss papers and research ideas with AI in a conversational interface
- **Multiple Chat Sessions** — Create, rename, delete, and switch between chat sessions
- **Markdown Rendering** — Full markdown support including tables (GFM), math formulas (KaTeX), and code blocks
- **Daily Summary** — Save important content from chats to daily summaries, organized by a calendar view
- **Insights** — Capture key insights from your reading and discussions
- **Today's Papers** — Track which papers you read each day
- **TODO List** — Manage research tasks
- **Welcome Back** — See a summary of today's papers and insights when you return
- **Search** — Search through chat history with keyword highlighting and navigation
- **Right-Click Save** — Select text in chat and right-click to save to Summary, Insights, or Today's Papers
- **Edit Messages** — Edit and resend your messages to get new AI responses
- **Markdown Editor** — Edit saved content with a full-featured markdown editor with syntax tips

### Getting Started

#### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm

#### Installation

```bash
git clone https://github.com/CCsoleilpeking/Research-bestie.git
cd Research-bestie
npm install
```

#### Run

Start both the backend server and the frontend dev server:

```bash
# Terminal 1: Start backend (web search + LLM proxy)
npm run server

# Terminal 2: Start frontend
npm run dev
```

Or run both at once:

```bash
npm run dev:all
```

Open `http://localhost:5173` in your browser.

> **Note:** The backend server (`localhost:3001`) provides web search capability via Exa AI. If the backend is not running, the app still works but without search — LLM calls go directly from the browser.

To access from another machine, use SSH port forwarding:

```bash
ssh -L 5173:localhost:5173 -L 3001:localhost:3001 user@your-server-ip
```

### Setup

1. Click the **Settings** (gear icon) in the top-left corner
2. Select your LLM provider (OpenAI, Claude, DeepSeek, Kimi, Gemini, or io.net)
3. Enter your API key
4. Choose a model from the dropdown
5. Click **Use this model**
6. Start chatting!

### Architecture

```
Frontend (React, port 5173)
  ↕
Backend (Express, port 3001)
  ├── /api/chat    → LLM call + auto web search
  ├── /api/tools   → Available tools list
  └── /api/health  → Health check
        ↕
  Exa MCP (mcp.exa.ai) → Free web search
```

When a user sends a message:
1. Frontend sends it to the backend `/api/chat`
2. Backend forwards to the LLM with a system prompt that includes search capability
3. If the LLM decides it needs to search, it returns a `[SEARCH: query]` tag
4. Backend detects the tag, calls Exa for search results
5. Results are sorted by trusted domains (arxiv, IEEE, ACM, etc. get priority)
6. Backend sends search results back to the LLM for a final answer
7. Final answer is returned to the frontend

### Tech Stack

- **React 18** + **TypeScript** — Frontend
- **Vite** — Build tool
- **Tailwind CSS** — Styling
- **Express** — Backend server
- **MCP SDK** — Model Context Protocol client for Exa
- **Exa AI** — Web search (free tier, no API key needed)
- **react-markdown** — Markdown rendering
- **remark-gfm** — GitHub Flavored Markdown (tables, strikethrough, etc.)
- **remark-math** + **rehype-katex** — Math formula rendering
- **KaTeX** — LaTeX math typesetting

### License

MIT

---

## 中文

一个基于大语言模型（LLM）的学术研究助手 Web 应用，帮助你阅读、讨论和整理学术论文。

### 功能特性

- **多模型支持** — 支持 OpenAI、Claude、DeepSeek、Kimi、Gemini、io.net，使用你自己的 API Key
- **联网搜索** — 后端通过 Exa AI 自动联网搜索，LLM 需要外部信息时自动触发，优先展示可信学术域名的结果
- **研究对话** — 以对话形式与 AI 讨论论文和研究想法
- **多会话管理** — 创建、重命名、删除、切换多个聊天会话
- **Markdown 渲染** — 完整的 Markdown 支持，包括表格（GFM）、数学公式（KaTeX）和代码块
- **每日摘要** — 将聊天中的重要内容保存到每日摘要，通过日历视图管理
- **研究洞察** — 记录阅读和讨论中的关键发现
- **今日论文** — 追踪每天阅读了哪些论文
- **待办事项** — 管理研究任务
- **欢迎回来** — 打开页面时自动展示今日的论文和洞察摘要
- **聊天搜索** — 搜索聊天记录，支持关键词高亮和逐条跳转
- **右键保存** — 选中聊天中的文字，右键即可保存到摘要、洞察或今日论文
- **消息编辑** — 编辑已发送的消息并重新获取 AI 回复
- **Markdown 编辑器** — 内置编辑器，支持 Markdown 语法提示

### 快速开始

#### 环境要求

- [Node.js](https://nodejs.org/) 18+
- npm

#### 安装

```bash
git clone https://github.com/CCsoleilpeking/Research-bestie.git
cd Research-bestie
npm install
```

#### 运行

分别启动后端和前端：

```bash
# 终端 1：启动后端（联网搜索 + LLM 代理）
npm run server

# 终端 2：启动前端
npm run dev
```

或者一键启动：

```bash
npm run dev:all
```

在浏览器中打开 `http://localhost:5173`。

> **说明：** 后端服务（`localhost:3001`）通过 Exa AI 提供联网搜索能力。如果后端未运行，应用仍可正常使用，但不具备搜索功能——LLM 调用将直接从浏览器发出。

如果需要从其他设备访问，通过 SSH 端口转发：

```bash
ssh -L 5173:localhost:5173 -L 3001:localhost:3001 user@你的服务器IP
```

### 使用方法

1. 点击左上角的 **设置**（齿轮图标）
2. 选择 LLM 服务商（OpenAI、Claude、DeepSeek、Kimi、Gemini 或 io.net）
3. 输入你的 API Key
4. 从下拉菜单选择模型
5. 点击 **Use this model**
6. 开始聊天！

### 架构

```
前端 (React, 端口 5173)
  ↕
后端 (Express, 端口 3001)
  ├── /api/chat    → LLM 调用 + 自动联网搜索
  ├── /api/tools   → 可用工具列表
  └── /api/health  → 健康检查
        ↕
  Exa MCP (mcp.exa.ai) → 免费联网搜索
```

用户发送消息时：
1. 前端将消息发送到后端 `/api/chat`
2. 后端携带包含搜索能力描述的系统提示词转发给 LLM
3. 如果 LLM 判断需要搜索，会返回 `[SEARCH: 查询词]` 标记
4. 后端检测到标记后，调用 Exa 进行搜索
5. 搜索结果按可信域名排序（arxiv、IEEE、ACM 等优先）
6. 后端将搜索结果发回 LLM 生成最终回答
7. 最终回答返回前端

### 技术栈

- **React 18** + **TypeScript** — 前端
- **Vite** — 构建工具
- **Tailwind CSS** — 样式框架
- **Express** — 后端服务
- **MCP SDK** — Model Context Protocol 客户端，连接 Exa
- **Exa AI** — 联网搜索（免费版，无需 API Key）
- **react-markdown** — Markdown 渲染
- **remark-gfm** — GitHub 风格 Markdown（表格、删除线等）
- **remark-math** + **rehype-katex** — 数学公式渲染
- **KaTeX** — LaTeX 数学排版

### 许可证

MIT
