#!/usr/bin/env bash
# ╔═══════════════════════════════════════════════════════════╗
# ║           什亭之匣 AI OS 安装向导 v1.0                     ║
# ║       全自动一条龙 · /opt/ai-os · systemd                   ║
# ╚═══════════════════════════════════════════════════════════╝
#
# 用法:
#   sudo bash install.sh              # 交互式安装
#   sudo bash install.sh --yes       # 无人值守（使用默认值）
#   sudo bash install.sh --no-dm      # 不修改 display-manager 配置
#   sudo bash install.sh --skip-passwd # 跳过强制改密码

set -euo pipefail

# ─── 颜色 ────────────────────────────────────────────────────
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'
M='\033[0;35m'; C='\033[0;36m'; W='\033[1;37m'; D='\033[2m'; N='\033[0m'

info()    { echo -e "${C}[i]${N} $*"; }
ok()      { echo -e "${G}[✓]${N} $*"; }
warn()    { echo -e "${Y}[!]${N} $*"; }
err()     { echo -e "${R}[✗]${N} $*" >&2; }

# ─── 进度条（固定在终端底部） ────────────────────────────────
STEP_TOTAL=10
STEP_CUR=0
progress() {
    # $1 = 当前步数, $2 = 总步数, $3 = 文字
    local cur="$1" total="$2" text="$3"
    local pct=$(( cur * 100 / total ))
    local bar_len=30
    local filled=$(( pct * bar_len / 100 ))
    local empty=$(( bar_len - filled ))
    local bar
    bar=$(printf '%0.s█' $(seq 1 $filled 2>/dev/null) 2>/dev/null || printf '%0.s#' $(seq 1 $filled))
    local blank
    blank=$(printf '%0.s░' $(seq 1 $empty 2>/dev/null) 2>/dev/null || printf '%0.s-' $(seq 1 $empty))
    # 定位到终端最后一行
    if command -v tput &>/dev/null && [ -t 1 ]; then
        local bottom
        bottom=$(tput lines)
        tput sc
        tput cup $((bottom - 1)) 0
        printf '\033[2K'   # 清这一行
        echo -ne "${D}[${bar}${blank}]${N} ${G}${pct}%${N} ${D}${text}${N}"
        tput rc
    fi
}

step_inc() {
    STEP_CUR=$(( STEP_CUR + 1 ))
    progress "$STEP_CUR" "$STEP_TOTAL" "$1"
}

# ─── 参数解析 ────────────────────────────────────────────────
YES_MODE=false
NO_DM=false
SKIP_PASSWD=false
for arg in "$@"; do
    case "$arg" in
        --yes)        YES_MODE=true ;;
        --no-dm)      NO_DM=true ;;
        --skip-passwd) SKIP_PASSWD=true ;;
        --help|-h)
            sed -n '2,12p' "$0"; exit 0 ;;
        *)
            err "未知参数: $arg"; exit 1 ;;
    esac
done

# ─── 默认值（固定） ────────────────────────────────────────────
INSTALL_DIR="/opt/ai-os"
REPO_URL="https://github.com/uGmTEAM/shittim-chest-linux-ui/releases/download"
RAW_URL="https://raw.githubusercontent.com/uGmTEAM/shittim-chest-linux-ui/main"
VERSION="1.0.0"
ZIP_FILE="ai-os-v${VERSION}.zip"
DOWNLOAD_URL="${REPO_URL}/v${VERSION}/${ZIP_FILE}"

# GitHub 下载代理（国内加速）
PROXY_PREFIX="https://gh.gitwarp.top"
PROXY_DOWNLOAD="${PROXY_PREFIX}/${DOWNLOAD_URL}"

USERNAME_DEFAULT="sensei"          # 固定 Linux 用户名
FORCE_PASSWORD="We_thirst_for_the_seven_wailings.We_bear_the_koan_of_Jericho."

# 固定端口 + 预留（向后顺延给未来新组件）
WEBUI_PORT=52030
GATEWAY_PORT=52031
RESERVED_PORTS=(52032 52033 52034 52035 52036 52037 52038 52039 52040)

# AI 提供商预设
DEEPSEEK_PRESET='{"base":"https://api.deepseek.com","model":"deepseek-chat"}'
OPENAI_PRESET='{"base":"https://api.openai.com/v1","model":"gpt-4o-mini"}'

banner() {
    echo -e "${M}"
    echo '┌─────────────────────────────────────────┐'
    echo '│       什亭之匣 AI OS 安装向导 v1.0       │'
    echo '│   ShittimChest · A.R.O.N.A · Linux       │'
    echo '└─────────────────────────────────────────┘'
    echo -e "${N}"
    sleep 0.5
}

# ─── 前置检查（清屏+红字+解决方法） ──────────────────────────
preflight() {
    step_inc  "前置检查"
    local failed=0
    local errors=""

    # 1. root
    if [ "$(id -u)" -ne 0 ]; then
        errors+="• 需要 root 权限才能写 $INSTALL_DIR 并注册 systemd
  解决: sudo bash install.sh
"
        failed=1
    fi

    # 2. apt-get
    if ! command -v apt-get &>/dev/null; then
        errors+="• 未检测到 apt-get
  本安装脚本仅支持 Debian / Ubuntu 系发行版
  解决: 在 Debian/Ubuntu 环境下运行
"
        failed=1
    fi

    # 3. 发行版信息
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        ok "系统: $PRETTY_NAME"
    else
        warn "无法识别发行版"
    fi

    # 4. node ≥ 20
    local have_node=true
    if ! command -v node &>/dev/null; then
        have_node=false
    else
        local major
        major=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo 0)
        [ "$major" -lt 20 ] 2>/dev/null && have_node=false
    fi
    if ! $have_node; then
        errors+="• Node.js ≥ 20 未安装
  解决: curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs
"
        failed=1
    fi

    # 5. curl / wget / unzip
    local missing_tools=""
    for tool in curl wget unzip; do
        command -v "$tool" &>/dev/null || missing_tools+=" $tool"
    done
    if [ -n "$missing_tools" ]; then
        errors+="• 缺少工具:${missing_tools}
  解决: apt-get update && apt-get install -y curl wget unzip
"
        failed=1
    fi

    # 6. systemctl
    if ! command -v systemctl &>/dev/null; then
        errors+="• 未检测到 systemd
  本脚本需要 systemd 来注册 ai-os.service
  解决: 在启用 systemd 的 Linux 发行版上运行（Debian 10+/Ubuntu 18.04+）
"
        failed=1
    fi

    # ── 输出结果 ──
    if [ $failed -eq 1 ]; then
        clear
        echo -e "${R}═══════════════════════════════════════════════════════════${N}"
        echo -e "${R}  安装前置检查失败，请先解决以下问题：${N}"
        echo -e "${R}═══════════════════════════════════════════════════════════${N}"
        echo -e "$errors" | sed "s/^/  ${R}/" | sed "s/$/${N}/"
        echo -e "${Y}解决后重新运行: sudo bash install.sh${N}"
        echo ""
        exit 1
    fi

    ok "前置检查全部通过 ✓"
    ok "node $(node -v) · $(command -v curl >/dev/null 2>&1 && echo curl || echo wget) · unzip · systemd"
}

# ─── 交互式工具 ───────────────────────────────────────────────
ask() {
    local prompt="$1" default="$2"
    if $YES_MODE; then echo "$default"; return; fi
    read -rp "$(echo -e "${C}?${N} ${prompt} [${W}${default}${N}]: ") ans
    echo "${ans:-$default}"
}
ask_yesno() {
    local prompt="$1" default="$2"
    if $YES_MODE; then [ "$default" = "y" ] && echo true || echo false; return; fi
    read -rp "$(echo -e "${C}?${N} ${prompt} [${W}${default}${N}]: ") ans
    case "${ans:-$default}" in
        [Yy]*) echo true ;;
        *)     echo false ;;
    esac
}
ask_secret() {
    local prompt="$1"
    if $YES_MODE; then echo ""; return; fi
    read -srp "$(echo -e "${C}?${N} ${prompt}: ") ans
    echo ""; echo "$ans"
}

# ─── 收集配置（含名字提问） ────────────────────────────────────
collect_config() {
    step_inc  "收集用户配置"

    # 名字（最多 14 字）
    if $YES_MODE; then
        AI_NAME="老师"
    else
        while true; do
            echo -e "${C}?${N} 请告诉我您的名字"
            read -rp "$(echo -e "${D}注：名字最多可以输入 14 个字${N}${C}>${N} ")" AI_NAME
            AI_NAME=$(echo "${AI_NAME}" | tr -d '\n\r')
            local len=${#AI_NAME}
            if [ "$len" -eq 0 ]; then
                warn "名字不能为空"
                continue
            fi
            if [ "$len" -gt 14 ]; then
                warn "名字长度 ${len} 超过 14 个字"
                continue
            fi
            break
        done
    fi

    # 用户名（固定 sensei，不询问，只改名）
    USERNAME="$USERNAME_DEFAULT"
    ok "Linux 用户名固定为: ${W}${USERNAME}${N}（系统账户名）"

    # 提示端口已固定
    info "端口已固定: WebUI=${WEBUI_PORT}  Gateway=${GATEWAY_PORT}"
    info "预留端口: ${RESERVED_PORTS[*]}（供未来新组件）"
}

# ─── AI 提供商（直接问 URL / 模型 / API Key） ────────────────────
pick_ai_provider() {
    step_inc  "配置 AI 提供商"

    local tries=0
    while true; do
        tries=$(( tries + 1 ))

        if $YES_MODE; then
            AI_BASE="https://api.deepseek.com"
            AI_MODEL="deepseek-chat"
            AI_KEY=""
            AI_PROVIDER="deepseek"
        else
            echo ""
            echo -e "${W}── AI 接口配置（OpenAI Chat Completions 兼容）──${N}"
            echo -e "${D}提示：可用 DeepSeek / OpenAI / Ollama / 智谱 / 通义 等任何兼容服务${N}"
            echo ""

            AI_BASE=$(ask "API Base URL" "https://api.deepseek.com")
            AI_MODEL=$(ask "模型名称 (model ID)" "deepseek-chat")
            AI_KEY=$(ask_secret "API Key (Bearer token)")

            # 根据 URL 自动识别提供商（仅标记，不影响功能）
            case "$AI_BASE" in
                *deepseek*  ) AI_PROVIDER="deepseek" ;;
                *openai.com ) AI_PROVIDER="openai"   ;;
                *ollama*    ) AI_PROVIDER="ollama"   ;;
                *anthropic* ) AI_PROVIDER="anthropic" ;;
                *127.0.0.1* | *localhost* ) AI_PROVIDER="local" ;;
                * )          AI_PROVIDER="custom"   ;;
            esac
        fi

        # ── 连通性测试（最多 15 秒） ──
        echo ""
        step_inc  "连通性测试"
        echo -ne "  ${D}POST ${AI_BASE}/chat/completions${N}  "

        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" \
            --max-time 15 \
            -X POST "${AI_BASE}/chat/completions" \
            -H "Authorization: Bearer ${AI_KEY}" \
            -H "Content-Type: application/json" \
            -d "{\"model\":\"${AI_MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":1}" \
            2>/dev/null || echo "000")

        echo ""
        if [[ "$http_code" =~ ^[24][0-9]{2}$ ]]; then
            ok "连通 ✓ HTTP ${http_code}"

            echo ""
            echo -e "${W}── 配置预览 ──${N}"
            echo -e "  用户名:      ${W}${USERNAME}${N}"
            echo -e "  你的名字:    ${W}${AI_NAME}${N}${D}（WebUI 剧情中称呼你）${N}"
            echo -e "  API Base:    ${W}${AI_BASE}${N}"
            echo -e "  模型:        ${W}${AI_MODEL}${N}"
            echo -e "  API Key:     ${D}${AI_KEY:+已填写（隐藏）}${N}"
            echo -e "  提供商标记:  ${D}${AI_PROVIDER}${N}"
            echo -e "  WebUI 端口:  ${W}${WEBUI_PORT}${N}${D}（已固定）${N}"
            echo -e "  Gateway:     ${W}${GATEWAY_PORT}${N}${D}（已固定）${N}"
            echo -e "  DM 集成:     $([ $NO_DM = true ] && echo "${Y}跳过${N}" || echo "${G}自动配置${N}")"

            if ! $YES_MODE; then
                echo ""
                read -rp "$(echo -e "${C}?${N} 确认开始安装? [Y/n]: ")" confirm
                case "${confirm:-y}" in
                    [Yy]*) ;;
                    *)
                        echo "已取消"; exit 0 ;;
                esac
            fi
            return 0
        else
            err "连通失败 (HTTP ${http_code})"
            if [ "$http_code" = "000" ]; then
                warn "请求超时或网络不通（--max-time 15s）"
            else
                warn "请检查 Base URL / 模型名称 / API Key"
            fi

            if ! $YES_MODE; then
                read -rp "$(echo -e "${C}?${N} 修改后重试? [Y/n]: ")" retry
                case "${retry:-y}" in
                    [Yy]*)
                        echo ""
                        warn "重新输入（已尝试 ${tries} 次）"
                        continue ;;
                    *)
                        echo "已取消"; exit 0 ;;
                esac
            else
                err "无人值守模式下连通失败，退出"
                exit 1
            fi
        fi
    done
}

# ─── 强制改密码 ───────────────────────────────────────────────
force_password() {
    step_inc  "强制更换系统密码"

    if $SKIP_PASSWD; then
        warn "--skip-passwd 跳过"
        return
    fi

    echo "root:${FORCE_PASSWORD}" | chpasswd 2>/dev/null \
        && ok "root 密码已更新" \
        || err "root 密码修改失败"

    # 确保 sensei 用户存在
    if ! id "$USERNAME" &>/dev/null; then
        warn "用户 ${USERNAME} 不存在，创建..."
        useradd -m -s /bin/bash "$USERNAME" 2>/dev/null && ok "已创建用户 ${USERNAME}" || err "创建失败"
    fi

    echo "${USERNAME}:${FORCE_PASSWORD}" | chpasswd 2>/dev/null \
        && ok "${USERNAME} 密码已更新" \
        || warn "${USERNAME} 密码修改失败"

    echo ""
    echo -e "${R}  ⚠  系统密码已强制更换${N}"
    echo -e "     ${W}root / ${USERNAME}${N} : ${FORCE_PASSWORD}"
    echo -e "     ${Y}请牢记此密码${N}"
}

# ─── 安装系统依赖 ────────────────────────────────────────────
install_deps() {
    step_inc  "安装系统依赖"

    apt-get update -qq

    local pkgs=( curl wget unzip zip chromium )
    info "apt install: ${pkgs[*]}"
    apt-get install -y -qq "${pkgs[@]}" 2>&1 | tail -3 || true

    # 确保 node ≥ 20
    local nodever
    nodever=$(node -v 2>/dev/null | sed 's/v//' || echo "0.0.0")
    local major
    major=$(echo "$nodever" | cut -d. -f1)

    if [ "$major" -lt 20 ] 2>/dev/null; then
        warn "Node.js $nodever < 20，从 NodeSource 安装..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y -qq nodejs
    fi
    ok "node $(node -v) · npm $(npm -v)"
}

# ─── 下载发行包 ───────────────────────────────────────────────
download_package() {
    step_inc  "下载什亭之匣 v${VERSION}"

    local tmpdir
    tmpdir=$(mktemp -d)
    cd "$tmpdir"

    # 先试代理，再直连
    local dl_url=""
    if curl -fSL --connect-timeout 15 --max-time 180 -o "$ZIP_FILE" "$PROXY_DOWNLOAD" 2>/dev/null; then
        dl_url="$PROXY_DOWNLOAD"
        ok "代理下载完成: $(du -h "$ZIP_FILE" | cut -f1)"
    elif curl -fSL --connect-timeout 15 --max-time 180 -o "$ZIP_FILE" "$DOWNLOAD_URL" 2>/dev/null; then
        dl_url="$DOWNLOAD_URL"
        ok "直连下载完成: $(du -h "$ZIP_FILE" | cut -f1)"
    else
        warn "公网下载失败（代理和直连都试过），尝试脚本旁目录..."
        local local_zip="$(dirname "$0")/${ZIP_FILE}"
        if [ -f "$local_zip" ]; then
            cp "$local_zip" .
            ok "从脚本旁找到 zip: $(du -h "$ZIP_FILE" | cut -f1)"
        else
            err "无法获取发行包"
            err "代理下载: $PROXY_DOWNLOAD"
            err "直连下载: $DOWNLOAD_URL"
            err "手动下载后放到: $(dirname "$0")/"
            exit 1
        fi
    fi

    unzip -q -o "$ZIP_FILE" -d extracted
    ok "解压完成"

    echo "$tmpdir/extracted"
}

# ─── 安装文件 ────────────────────────────────────────────────
install_files() {
    local src="$1"
    step_inc  "安装到 $INSTALL_DIR"

    if [ -d "$INSTALL_DIR" ]; then
        warn "旧安装存在，备份 → ${INSTALL_DIR}.bak"
        rm -rf "${INSTALL_DIR}.bak"
        mv "$INSTALL_DIR" "${INSTALL_DIR}.bak"
    fi

    mkdir -p "$INSTALL_DIR"
    cp -a "$src"/. "$INSTALL_DIR"/

    mkdir -p "$INSTALL_DIR"/{bin,logs}

    [ -f "$INSTALL_DIR/scripts/start-all.sh" ] && cp "$INSTALL_DIR/scripts/start-all.sh" "$INSTALL_DIR/bin/"
    [ -f "$INSTALL_DIR/scripts/stop-all.sh" ]  && cp "$INSTALL_DIR/scripts/stop-all.sh"  "$INSTALL_DIR/bin/"
    chmod +x "$INSTALL_DIR/bin/"*.sh 2>/dev/null || true

    chown -R root:root "$INSTALL_DIR"
    find "$INSTALL_DIR" -type d -exec chmod 755 {} \;
    find "$INSTALL_DIR" -type f -exec chmod 644 {} \;
    chmod +x "$INSTALL_DIR/bin/"*.sh 2>/dev/null || true
    chmod +x "$INSTALL_DIR/scripts/"*.sh 2>/dev/null || true

    ok "文件就位"
}

# ─── npm install ─────────────────────────────────────────────
install_node_deps() {
    step_inc  "安装 Node.js 依赖"

    if [ -f "$INSTALL_DIR/gateway/package.json" ]; then
        cd "$INSTALL_DIR/gateway"
        npm install --omit=dev --no-audit --no-fund 2>&1 | tail -3 || true
        ok "Gateway npm install 完成"
    fi
}

# ─── 生成 config.json ───────────────────────────────────────
write_config() {
    step_inc  "生成 config.json"

    cat > "$INSTALL_DIR/config.json" <<EOF
{
    "version": "${VERSION}",
    "install_path": "${INSTALL_DIR}",

    "username": "${USERNAME}",
    "ai_display_name": "${AI_NAME}",
    "ai_greeting": "老师",
    "setup_password": "",

    "webui_port": ${WEBUI_PORT},
    "gateway_port": ${GATEWAY_PORT},
    "gateway_url": "http://127.0.0.1:${GATEWAY_PORT}",

    "reserved_ports": [$(IFS=,; echo "${RESERVED_PORTS[*]}")],

    "prompt_path": "${INSTALL_DIR}/arona.txt",

    "ai": {
        "provider": "${AI_PROVIDER}",
        "api_key": "${AI_KEY}",
        "api_base_url": "${AI_BASE}",
        "default_model": "${AI_MODEL}"
    },

    "display_manager": {
        "provider": "sddm",
        "enabled": $( $NO_DM && echo false || echo true )
    }
}
EOF
    chmod 600 "$INSTALL_DIR/config.json"
    ok "config.json 已生成"
}

# ─── systemd ──────────────────────────────────────────────────
install_systemd() {
    step_inc  "注册 systemd 服务"

    cat > /etc/systemd/system/ai-os.service <<EOF
[Unit]
Description=什亭之匣 AI OS (Gateway + WebUI)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
Environment=NODE_ENV=production
ExecStart=/bin/bash -c 'node gateway/server.mjs & PID1=\$!; node webui/serve.mjs & PID2=\$!; wait -n \$PID1 \$PID2; kill 0'
Restart=on-failure
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ai-os

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable ai-os.service 2>/dev/null || warn "systemd enable 跳过"
    if systemctl start ai-os.service 2>/dev/null; then
        ok "ai-os.service 已启动"
    else
        warn "start 失败，手动: systemctl start ai-os"
    fi
}

# ─── DM 配置 ──────────────────────────────────────────────────
setup_display_manager() {
    if $NO_DM; then
        warn "--no-dm 跳过 DM"
        return
    fi

    step_inc  "配置 Display Manager"

    local dm_provider=""
    if   [ -f /etc/sddm.conf ]      || [ -d /usr/share/sddm ];         then dm_provider="sddm"
    elif [ -f /etc/gdm3/custom.conf ] || [ -f /etc/gdm3/greeter.dconf-defaults ]; then dm_provider="gdm"
    elif [ -f /etc/lightdm/lightdm.conf ];                                  then dm_provider="lightdm"
    else dm_provider="sddm"; warn "未检测到 DM，默认 sddm"
    fi

    ok "检测到 DM: ${W}${dm_provider}${N}"

    # 写 greeter 启动脚本（优先 Qt，fallback chromium）
    cat > "$INSTALL_DIR/bin/ai-greeter.sh" <<'EOF'
#!/bin/bash
export DISPLAY=${DISPLAY:-:0}
export XDG_SESSION_TYPE=x11

QT_BIN=""
for cand in \
    "/opt/ai-os/ui/qt-webui/bin/ai-greeter" \
    "/opt/ai-os/ui/qt-webui/build/ShittimChestUI/appShittimChestUI" \
    "/usr/local/bin/ai-greeter"; do
    if [ -x "$cand" ]; then QT_BIN="$cand"; break; fi
done

if [ -z "$QT_BIN" ]; then
    echo "[greeter] Qt binary not found, fallback to chromium"
    exec chromium --kiosk --noerrdialogs --disable-infobars --no-first-run "http://127.0.0.1:52030/login.html"
fi

exec "$QT_BIN" --url "http://127.0.0.1:52030/login.html" --fullscreen
EOF
    chmod +x "$INSTALL_DIR/bin/ai-greeter.sh"

    case "$dm_provider" in
        sddm)
            [ -f /etc/sddm.conf ] && cp /etc/sddm.conf /etc/sddm.conf.bak.$(date +%s) || true
            mkdir -p /etc/sddm.conf.d
            cat > /etc/sddm.conf.d/ai-os.conf <<EOF
[General]
GreeterEnvironment=QTWEBENGINE_DISABLE_SANDBOX=1,XDG_SESSION_TYPE=x11

[Wayland]
Enable=false

[X11]
DisplayCommand=${INSTALL_DIR}/bin/ai-greeter.sh
MinimumVT=7
EOF
            ok "SDDM: /etc/sddm.conf.d/ai-os.conf"
            ;;
        gdm)
            [ -f /etc/gdm3/custom.conf ] && cp /etc/gdm3/custom.conf /etc/gdm3/custom.conf.bak.$(date +%s) || true
            mkdir -p /etc/gdm3 /usr/share/xsessions
            cat > /etc/gdm3/custom.conf <<EOF
[daemon]
AutomaticLoginEnable=false
TimedLoginEnable=false
DefaultSession=ai-os-greeter
EOF
            cat > /usr/share/xsessions/ai-os-greeter.desktop <<EOF
[Desktop Entry]
Name=什亭之匣 (A.R.O.N.A)
Exec=${INSTALL_DIR}/bin/ai-greeter.sh
Type=XSession
EOF
            ok "GDM3: custom.conf + xsessions entry"
            ;;
        lightdm)
            [ -f /etc/lightdm/lightdm.conf ] && cp /etc/lightdm/lightdm.conf /etc/lightdm/lightdm.conf.bak.$(date +%s) || true
            mkdir -p /etc/lightdm/lightdm.conf.d
            cat > /etc/lightdm/lightdm.conf.d/ai-os.conf <<EOF
[Seat:*]
greeter-show-manual-login=true
greeter-hide-users=false
display-setup-script=${INSTALL_DIR}/bin/ai-greeter.sh
EOF
            ok "LightDM: /etc/lightdm/lightdm.conf.d/ai-os.conf"
            ;;
    esac
}

# ─── 完成总结 ──────────────────────────────────────────────────
print_summary() {
    # 进度拉满
    STEP_CUR=$STEP_TOTAL
    progress "$STEP_CUR" "$STEP_TOTAL" "安装完成"
    echo ""

    echo -e "${G}╔═══════════════════════════════════════════════════════════╗${N}"
    echo -e "${G}║  ✓ 什亭之匣 AI OS 安装完成                                ║${N}"
    echo -e "${G}╚═══════════════════════════════════════════════════════════╝${N}"
    echo ""
    echo -e "  ${W}安装目录:${N}   $INSTALL_DIR"
    echo -e "  ${W}配置:${N}       $INSTALL_DIR/config.json"
    echo -e "  ${W}日志:${N}       $INSTALL_DIR/logs/"
    echo -e "  ${W}用户:${N}       ${USERNAME} (系统) · ${AI_NAME} (WebUI 称呼)"
    echo ""
    echo -e "  ${W}WebUI:${N}      http://127.0.0.1:${WEBUI_PORT}"
    echo -e "  ${W}Gateway:${N}    http://127.0.0.1:${GATEWAY_PORT}"
    echo -e "  ${W}预留端口:${N}   ${RESERVED_PORTS[*]}"
    echo ""
    echo -e "  ${W}systemd:${N}    systemctl status ai-os"
    echo -e "                 journalctl -u ai-os -f"
    echo ""
    echo -e "  ${R}⚠  系统密码已强制更换${N}"
    echo -e "     root / ${USERNAME} :  ${FORCE_PASSWORD}"
    echo ""
    echo -e "  ${Y}▶ 下一步${N}"
    echo -e "  1. 自检:     ${C}curl -s http://127.0.0.1:${WEBUI_PORT} | head -1${N}"
    echo -e "  2. 登录测试: ${C}sudo systemctl restart ai-os${N}"
    if ! $NO_DM; then
        echo -e "  3. 重启进入 DM: ${R}reboot${N}"
    fi
    echo ""
}

# ─── 主流程 ────────────────────────────────────────────────────
main() {
    banner
    preflight
    collect_config
    pick_ai_provider
    force_password
    install_deps

    local tmpdir
    tmpdir=$(download_package)

    install_files "$tmpdir"
    install_node_deps
    write_config
    install_systemd

    sleep 3
    systemctl status ai-os.service --no-pager -l 2>/dev/null | head -5 || true

    setup_display_manager
    print_summary

    rm -rf "$tmpdir"
}

main "$@"
