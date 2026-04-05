# ResearchBestie

[English](#english) | [中文](#中文)

## Demo

[https://github.com/user-attachments/assets/1e011633-fbe8-4412-a8e9-4a75393d6143](https://github.com/user-attachments/assets/6c04a44d-99a3-4d35-9d6b-3f48f3a08283)

---

## English

A research companion web app that helps you read, discuss, and organize academic papers using LLMs.

### Features

- **Multi-LLM Support** — OpenAI, Claude, DeepSeek, Kimi, Gemini, io.net
- **Web Search** — Auto search via Exa AI with full-page crawling and trusted domain prioritization
- **File Upload** — PDF, DOCX, PPTX, XLSX, TXT, MD, HTML and more (drag & drop, max 4 files)
- **Memory System** — SQLite conversation storage with auto compression
- **Research Tools** — Daily Summary, Insights, Today's Papers, TODO List with calendar view
- **Markdown Rendering** — Tables, math formulas (KaTeX), code blocks
- **Multiple Chat Sessions** — Create, rename, delete, switch

### Getting Started

#### Prerequisites

- [Node.js](https://nodejs.org/) 22+ (required for PDF parsing)
- npm

**Quick install Node.js 22:**

```bash
# macOS
brew install node@22

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs

# Windows
winget install OpenJS.NodeJS.LTS
```

#### Installation

```bash
git clone https://github.com/CCsoleilpeking/Research-bestie.git
cd Research-bestie
npm install
```

#### Run

Start both the backend and frontend:

```bash
# Terminal 1: Backend (web search + memory + file parsing)
npm run server

# Terminal 2: Frontend
npm run dev
```

Open `http://localhost:5173` in your browser.

> **Note:** The backend server (`localhost:3001`) provides web search, memory compression, and file upload. If the backend is not running, the app still works but without these features.

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

### License

MIT

---

## 中文

一个基于大语言模型（LLM）的学术研究助手 Web 应用，帮助你阅读、讨论和整理学术论文。

### 功能特性

- **多模型支持** — OpenAI、Claude、DeepSeek、Kimi、Gemini、io.net
- **联网搜索** — 通过 Exa AI 自动搜索，自动抓取论文全文，优先展示可信学术域名
- **文件上传** — 支持 PDF、DOCX、PPTX、XLSX、TXT、MD、HTML 等（拖拽上传，最多 4 个文件）
- **记忆系统** — 基于 SQLite 的对话存储，自动压缩记忆
- **研究工具** — 每日摘要、研究洞察、今日论文、待办事项，日历视图管理
- **Markdown 渲染** — 表格、数学公式（KaTeX）、代码块
- **多会话管理** — 创建、重命名、删除、切换

### 快速开始

#### 环境要求

- [Node.js](https://nodejs.org/) 22+（PDF 解析需要）
- npm

**快速安装 Node.js 22：**

```bash
# macOS
brew install node@22

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs

# Windows
winget install OpenJS.NodeJS.LTS
```

#### 安装

```bash
git clone https://github.com/CCsoleilpeking/Research-bestie.git
cd Research-bestie
npm install
```

#### 运行

分别启动后端和前端：

```bash
# 终端 1：启动后端（联网搜索 + 记忆系统 + 文件解析）
npm run server

# 终端 2：启动前端
npm run dev
```

在浏览器中打开 `http://localhost:5173`。

> **说明：** 后端服务（`localhost:3001`）提供联网搜索、记忆压缩和文件上传功能。如果后端未运行，应用仍可正常使用，但不具备这些功能。

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

### 许可证

MIT
