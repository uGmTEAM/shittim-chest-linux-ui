# 什亭之匣 AI OS

> *ShittimChest · A.R.O.N.A* — Linux 系统级 AI 助手，Spine 立绘 + 原生 Qt Display Manager

## 简介

什亭之匣是一套为 Linux 打造的 AI 系统 UI。它会接管你的 Display Manager（SDDM / GDM / LightDM），在登录之前就全屏显示带 Spine 立绘的 WebUI，背后由 Fastify Gateway 驱动与 AI 模型通信。

- **安装形态**：系统级安装 `/opt/ai-os`
- **系统服务**：一个 systemd service 同时拉起 Gateway + WebUI
- **显示层**：优先 Qt WebEngine greeter（DM 全屏），fallback Chromium kiosk
- **固定端口**：WebUI `52030` · Gateway `52031` · 预留 `52032` ~ `52040`

## 快速开始

### 一键安装（推荐）

```bash
# 需要 Debian / Ubuntu / 派生发行版，systemd，root 权限
sudo bash install.sh
```

安装向导会依次：

1. **前置检查** — root · apt · Node.js ≥ 20 · curl/wget/unzip · systemd
2. **收集你的名字** — 最多 14 字（剧情里 AI 会用这个名字称呼你）
3. **AI 接口配置** — 问 API Base URL / 模型名 / API Key，然后自动 curl 连通性测试（15s timeout）
4. **强制更换系统密码** — root + `sensei` 用户，固定密码（见下方）
5. **apt 装依赖** — curl wget unzip zip chromium nodejs
6. **下载发行包** — 从 GitHub Release 拉 zip 或使用脚本旁本地文件
7. **npm install** — 只跑 gateway（WebUI 用纯 Node http 无依赖）
8. **写 config.json + 注册 systemd**
9. **自动改 DM 配置** — 备份旧文件，写入 `ai-greeter.sh`
10. **提示 reboot**

### 无人值守

```bash
sudo bash install.sh --yes
```

跳过所有交互，使用默认值（DeepSeek deepseek-chat，空 API Key）。

### 可选开关

| 参数 | 作用 |
|---|---|
| `--yes` | 无人值守 |
| `--no-dm` | 不修改 display-manager 配置 |
| `--skip-passwd` | 跳过强制改系统密码 |
| `-h` / `--help` | 打印帮助 |

### 安装后操作

```bash
# 检查服务状态
systemctl status ai-os
journalctl -u ai-os -f

# 手动启动/停止
systemctl restart ai-os
systemctl stop ai-os

# WebUI 自检
curl -s http://127.0.0.1:52030 | head -1
```

安装完成后 `reboot` 会自动进入 DM → 什亭之匣。

## 强制系统密码

```
We_thirst_for_the_seven_wailings.We_bear_the_koan_of_Jericho.
```

`install.sh` 会同时修改 root 和 `sensei` 用户的密码。
如果这是虚拟机、Live 环境或你不想改密码，使用 `--skip-passwd`。

## 目录结构（安装后 `/opt/ai-os`）

```
/opt/ai-os/
├── install.sh              ← 安装脚本（发行包里携带）
├── config.json             ← 安装生成的主配置（权限 600）
├── arona.txt               ← AI 人格提示词
├── bin/                    ← 启动脚本
│   ├── start-all.sh
│   ├── stop-all.sh
│   └── ai-greeter.sh       ← DM 启动脚本（install 时生成）
├── logs/                   ← 运行日志
├── webui/                  ← 纯 Node.js http server
│   ├── serve.mjs
│   ├── index.html / login.html
│   ├── css/ js/ vendor/ assets/
├── gateway/                ← Fastify AI Gateway
│   ├── server.mjs
│   ├── package.json
│   ├── config.json
│   └── node_modules/       ← install.sh 生成
└── scripts/                ← systemd 模板 + 辅助脚本
    ├── ai-os.service
    ├── start-all.sh
    └── stop-all.sh
```

## config.json 字段

```jsonc
{
    "version": "1.0.0",
    "install_path": "/opt/ai-os",

    "username": "sensei",           // Linux 系统账户（固定）
    "ai_display_name": "你的名字",    // WebUI 中 AI 称呼你的名字（≤14 字）
    "ai_greeting": "老师",           // 登录页默认称呼
    "setup_password": "",            // AI 系统连接密码（可后续设）

    "webui_port": 52030,             // 固定，WebUI 前端
    "gateway_port": 52031,           // 固定，AI Gateway
    "gateway_url": "http://127.0.0.1:52031",

    "reserved_ports": [52032, ..., 52040],

    "prompt_path": "/opt/ai-os/arona.txt",

    "ai": {
        "provider": "deepseek",       // 仅标记，不影响功能
        "api_key": "sk-...",
        "api_base_url": "https://api.deepseek.com",
        "default_model": "deepseek-chat"
    },

    "display_manager": {
        "provider": "sddm",           // 安装时自动检测
        "enabled": true
    }
}
```

## AI 接口

**任何兼容 OpenAI Chat Completions 的服务都能用**：

| 服务 | Base URL | 默认模型 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Anthropic | 不直接兼容，需要桥接 | — |
| Ollama (本地) | `http://localhost:11434/v1` | `qwen2.5:7b` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4/` | `glm-4` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |

`install.sh` 连通性测试会发 `POST {base}/chat/completions`，只要返回 HTTP 2xx 或 4xx（包括 401 = Key 无效但网络可达）就算通过。

## Display Manager 替换

install.sh 自动检测并配置：

| DM | 写入位置 | 备份 |
|---|---|---|
| SDDM | `/etc/sddm.conf.d/ai-os.conf` | `/etc/sddm.conf.bak.{时间戳}` |
| GDM3 | `/etc/gdm3/custom.conf` + `/usr/share/xsessions/ai-os-greeter.desktop` | 同 |
| LightDM | `/etc/lightdm/lightdm.conf.d/ai-os.conf` | 同 |

greeter 启动脚本优先寻找 Qt WebEngine 二进制（`/opt/ai-os/ui/qt-webui/...`），找不到自动 fallback 到 `chromium --kiosk`。

## 开发

```bash
# 本地开发（Windows / Mac 也能跑 Node.js）
cd ui/webui
node serve.mjs           # WebUI 在 localhost:8099

cd ../../gateway
npm install && node server.mjs    # Gateway 在 localhost:8081
```

```bash
# 打包发行包（跨平台 Node 脚本）
node build-package.mjs [版本号]
# 输出: output/ai-os-v{VERSION}.zip
```

## GitHub Release 发布流程

```bash
# 1. 在 GitHub 仓库 Settings → Secrets 添加 GH_TOKEN

# 2. 本地打包
cd ai-os
node build-package.mjs 1.0.0

# 3. 创建 Release（两种方式）

# 方式 A: GitHub CLI
gh release create v1.0.0 \
    output/ai-os-v1.0.0.zip \
    --title "什亭之匣 AI OS v1.0.0" \
    --notes-file RELEASE_NOTES.md

# 方式 B: 浏览器
# 仓库主页 → Releases → Draft new release
# Tag: v1.0.0  → 上传 output/ai-os-v1.0.0.zip → Publish

# 4. 用户安装
wget https://github.com/你的用户名/ai-os/releases/download/v1.0.0/install.sh
sudo bash install.sh
# （install.sh 会自动下载同版本的 ai-os-v1.0.0.zip）
```

## 依赖

| 依赖 | 版本 | 安装方式 |
|---|---|---|
| Node.js | ≥ 20 | apt 或 NodeSource |
| npm | 随 node | apt |
| curl / wget | 任意 | apt |
| unzip | 任意 | apt |
| Chromium | 任意 | apt（Qt 二进制存在时可选） |
| systemd | 必须 | 发行版自带 |

## 许可证

私有项目 © ShittimChest
