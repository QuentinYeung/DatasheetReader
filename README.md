# Datasheet Reader

面向电子硬件工程师的本地芯片数据手册阅读、专业翻译与学习助手。

## 当前进度

阶段 1 已实现本地 PDF 阅读器的开发版本：

- React 双栏界面，左侧显示 PDF，右侧预留翻译面板。
- FastAPI 接收 PDF，并保存一份应用副本；不会修改原始文件。
- PDF.js 渲染原始页面，支持翻页、页码跳转、60%～240% 缩放和文字选择。
- 选中的原文及 PDF 页序号显示在右侧。
- 拒绝非 PDF、损坏 PDF、加密 PDF 和超过 50 MB 的文件。

本阶段没有 AI、中文翻译、全文翻译、OCR 或笔记功能。扫描版 PDF 可以显示，但没有文字层时无法选中文字。完整开发路线见 [docs/PLAN.md](docs/PLAN.md)。

## 项目结构

```text
DatasheetReader/
├─ backend/                 FastAPI 后端、PDF 存储与接口测试
├─ frontend/                React、PDF.js、界面测试与浏览器冒烟测试
├─ scripts/                 Windows 安装和启动脚本
├─ docs/PLAN.md             产品与后续阶段计划
└─ README.md
```

导入的 PDF 副本不会放进 Git 仓库。Windows 默认保存在：

```text
%LOCALAPPDATA%\DatasheetReader\documents
```

文件名使用内容摘要，避免同名文件互相覆盖。原始 PDF 保留在原位置且不会被程序删除。

## Windows 初学者启动步骤

以下步骤面向 Windows 11 64 位。阶段 1 已在 Linux 云环境完成自动和浏览器测试；Windows 实机仍需要按这里验收。

### 1. 安装一次基础工具

1. 安装 [Python 3.12](https://www.python.org/downloads/)。安装界面勾选 **Add Python to PATH**。
2. 安装 [Node.js 22 LTS](https://nodejs.org/)。保持默认选项即可。
3. 重新打开资源管理器或命令提示符，让系统识别新安装的命令。

不需要安装数据库，也不需要 AI 密钥。

### 2. 安装项目依赖

进入项目文件夹，双击：

```text
scripts\setup_windows.bat
```

脚本会创建独立的 Python 环境并安装前后端依赖。第一次运行需要联网，时间通常为几分钟。看到 `Setup completed` 表示安装成功。

### 3. 启动软件

双击：

```text
scripts\start_windows.bat
```

系统会打开两个命令窗口，并在默认浏览器打开：

```text
http://127.0.0.1:5173
```

这两个窗口分别运行后端和前端，使用软件期间不要关闭。结束使用时关闭这两个窗口即可。

### 4. 打开一份 PDF

1. 点击右上角“打开 PDF”。
2. 选择一份带文字层的英文数据手册，大小不超过 50 MB。
3. 等待页面出现后，使用工具栏翻页或缩放。
4. 在 PDF 页面上按住鼠标左键拖动选择英文；选中的原文会出现在右侧。

若鼠标只能框出图片而不能选字，这份 PDF 很可能是扫描件，本阶段暂不支持 OCR。

## 开发者手动运行

在项目根目录安装后端依赖：

```powershell
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
```

安装前端依赖：

```powershell
cd frontend
npm ci
cd ..
```

打开第一个终端，在项目根目录启动后端：

```powershell
.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

打开第二个终端，在 `frontend` 目录启动前端：

```powershell
npm run dev
```

浏览器访问 `http://127.0.0.1:5173`。开发服务器只监听本机地址，不向局域网开放。

## 测试命令

后端接口测试，在项目根目录执行：

```powershell
.venv\Scripts\python.exe -m pytest backend\tests
```

前端组件测试和生产构建，在 `frontend` 目录执行：

```powershell
npm test
npm run build
```

浏览器冒烟测试需要先启动前后端，并设置可用 Chromium 路径；它主要用于开发环境：

```powershell
$env:CHROMIUM_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
npm run e2e
```

## 技术说明

| 层次 | 技术 | 用途 |
| --- | --- | --- |
| 前端 | React、Vite | 双栏界面和交互 |
| PDF | react-pdf、PDF.js | 原始页面、文字层和链接层渲染 |
| 后端 | Python 3.12、FastAPI | 文件导入、校验和本地读取 |
| PDF 校验 | pypdf | 识别损坏、空白和加密文档 |
| 测试 | pytest、Vitest、Playwright | 接口、组件和真实浏览器流程 |

前端通过 Vite 把 `/api` 请求转发到本机 FastAPI，因此浏览器不需要读取任意磁盘路径。后端只接受由内容摘要构成的文档 ID，不能利用接口访问其他本地文件。

## 已知限制

- 目前一次只阅读一份活动文档，刷新页面后需要重新选择 PDF。
- 不支持加密 PDF、超过 50 MB 的文件和扫描件文字识别。
- PDF 多栏文本的选择顺序由文件自身的文字层决定，可能与视觉顺序不同。
- 尚未在用户的 Windows 电脑上完成实机验收。
- 右侧翻译区目前只显示选中的英文，不会调用任何 AI 服务。

## 后续阶段

下一阶段才会讨论专业翻译、参数保真校验和 AI 服务。进入下一阶段前，先在 Windows 上验收本阶段的导入、显示、翻页、缩放和文字选择。
