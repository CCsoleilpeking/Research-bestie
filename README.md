# ResearchBestie

[English](#english) | [中文](#中文)

## Demo

https://github.com/user-attachments/assets/1e011633-fbe8-4412-a8e9-4a75393d6143

---

## English

A research companion web app that helps you read, discuss, and organize academic papers using LLMs.

### Features

- **Multi-LLM Support** — Connect to OpenAI, Claude, DeepSeek, Kimi, Gemini, or io.net with your own API key
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

#### Run Development Server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

To access from another machine on the same network, the dev server binds to `0.0.0.0:5173` by default. You can also use SSH port forwarding:

```bash
ssh -L 5173:localhost:5173 user@your-server-ip
```

### Setup

1. Click the **Settings** (gear icon) in the top-left corner
2. Select your LLM provider (OpenAI, Claude, DeepSeek, Kimi, Gemini, or io.net)
3. Enter your API key
4. Choose a model from the dropdown
5. Start chatting!

### Tech Stack

- **React 18** + **TypeScript**
- **Vite** — Build tool
- **Tailwind CSS** — Styling
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

#### 启动开发服务器

```bash
npm run dev
```

在浏览器中打开 `http://localhost:5173`。

如果需要从其他设备访问，开发服务器默认绑定 `0.0.0.0:5173`。也可以通过 SSH 端口转发：

```bash
ssh -L 5173:localhost:5173 user@你的服务器IP
```

### 使用方法

1. 点击左上角的 **设置**（齿轮图标）
2. 选择 LLM 服务商（OpenAI、Claude、DeepSeek、Kimi、Gemini 或 io.net）
3. 输入你的 API Key
4. 从下拉菜单选择模型
5. 开始聊天！

### 技术栈

- **React 18** + **TypeScript**
- **Vite** — 构建工具
- **Tailwind CSS** — 样式框架
- **react-markdown** — Markdown 渲染
- **remark-gfm** — GitHub 风格 Markdown（表格、删除线等）
- **remark-math** + **rehype-katex** — 数学公式渲染
- **KaTeX** — LaTeX 数学排版

### 许可证

MIT
