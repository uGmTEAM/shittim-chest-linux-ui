#!/bin/bash
# ============================================================
# ShittimChestUI - Qt6 Spine 动画桌面部署脚本
# 适用: Debian 13 (trixie) + Qt6 Quick (OpenGL)
# 用法: sudo bash deploy-ui.sh
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*"; exit 1; }

echo ""
echo "============================================================"
echo "  ShittimChestUI - Qt6 Spine 桌面部署"
echo "============================================================"
echo ""

if [ "$EUID" -ne 0 ]; then
    err "请使用 sudo 运行: sudo bash deploy-ui.sh"
fi

# ─── 检查网络 ──────────────────────────────────────────────
info "[0/5] 检查网络连接..."
if ! curl -s --max-time 5 https://www.debian.org -o /dev/null; then
    err "无法访问外网，请检查网络"
fi
ok "网络正常"

# ─── 1. 安装 Qt6 运行时 ─────────────────────────────────
info "[1/5] 安装 Qt6 运行时库..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq 2>/dev/null

# Qt6 Quick + OpenGL + 基础库
apt-get install -y --no-install-recommends \
    libqt6core6t64 \
    libqt6gui6 \
    libqt6quick6 \
    libqt6qml6 \
    libqt6qmlmodels6 \
    libqt6qmlnetwork6 \
    libqt6network6 \
    libqt6opengl6 \
    libqt6svg6 \
    libgl1 \
    libegl1 \
    libgbm1 \
    libxkbcommon0 \
    fonts-wqy-zenhei \
    fonts-wqy-microhei \
    2>/dev/null

ok "Qt6 运行时安装完成"

# ─── 2. 创建目录结构 ───────────────────────────────────
info "[2/5] 创建目录结构..."
mkdir -p /opt/ai-os/ui
mkdir -p /opt/ai-os/ui/resources/spine/characters/arona
mkdir -p /opt/ai-os/ui/resources/spine/characters/plana
mkdir -p /opt/ai-os/ui/resources/spine/backgrounds/daytime
mkdir -p /opt/ai-os/ui/resources/spine/backgrounds/nighttime
mkdir -p /etc/systemd/system
ok "目录创建完成"

# ─── 3. 部署 UI 应用 ───────────────────────────────────
info "[3/5] 部署 UI 应用..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_SRC="${SCRIPT_DIR}/../ui"

if [ -f "${APP_SRC}/appShittimChestUI" ]; then
    # Linux 编译版
    cp "${APP_SRC}/appShittimChestUI" /opt/ai-os/ui/
    ok "UI 应用已部署"
elif [ -d "${APP_SRC}" ]; then
    # 从源码目录复制资源文件
    if [ -d "${APP_SRC}/resources" ]; then
        cp -r "${APP_SRC}/resources/"* /opt/ai-os/ui/resources/
        ok "Spine 资源已复制"
    fi
    if [ -f "${APP_SRC}/Main.qml" ]; then
        cp "${APP_SRC}/Main.qml" /opt/ai-os/ui/
        ok "Main.qml 已复制"
    fi
else
    warn "未找到 UI 源码，跳过"
fi

# ─── 4. 创建启动脚本 ───────────────────────────────────
info "[4/5] 创建启动脚本..."

cat > /opt/ai-os/ui/start.sh << 'EOF'
#!/bin/bash
# ShittimChestUI 启动脚本
export QT_QPA_PLATFORM=wayland 2>/dev/null || export QT_QPA_PLATFORM=xcb
export QT_SCALE_FACTOR=1.0
export QT_LOGGING_RULES="qt.qpa.backends=false;qt.multimedia.windowsmediafoundation=false"

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$APP_DIR/appShittimChestUI" "$@"
EOF
chmod +x /opt/ai-os/ui/start.sh

# 如果只有资源文件，创建说明
if [ ! -f /opt/ai-os/ui/appShittimChestUI ]; then
    cat > /opt/ai-os/ui/BUILD.md << 'EOF'
# ShittimChestUI 构建说明

## 编译步骤

```bash
# 1. 安装构建依赖
sudo apt-get install -y qt6-base-dev qt6-declarative-dev cmake g++ make

# 2. 编译
cd /opt/ai-os/ui
mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
make -j$(nproc)

# 3. 运行
./appShittimChestUI
```
EOF
    ok "README 已创建（需要先编译）"
fi

# ─── 5. 注册 systemd 服务 ──────────────────────────────
info "[5/5] 注册 systemd 服务..."

cat > /etc/systemd/system/shittim-chest.service << 'SVCEOF'
[Unit]
Description=ShittimChest UI (Spine Animation Desktop)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-os/ui
Environment=QT_QPA_PLATFORM=xcb
Environment=QT_SCALE_FACTOR=1.0
ExecStart=/opt/ai-os/ui/appShittimChestUI
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable shittim-chest.service 2>/dev/null || true

# ─── 完成 ───────────────────────────────────────────────
echo ""

# ─── 权限锁定：仅 root 可更改 ───────────────────────────
if [ -d /opt/ai-os ]; then
    chown -R root:root /opt/ai-os
    find /opt/ai-os -type d -exec chmod 755 {} \;
    find /opt/ai-os -type f -exec chmod 644 {} \;
    find /opt/ai-os -type f -name "*.sh" -exec chmod 755 {} \;
    find /opt/ai-os -type f -name "*.service" -exec chmod 644 {} \;
    ok "权限已锁定：/opt/ai-os/ 仅 root 可更改"
fi

echo ""
echo "============================================================"
echo "  部署完成!"
echo "============================================================"
echo ""
echo "  UI 目录:      /opt/ai-os/ui/"
echo "  启动方式:     /opt/ai-os/ui/start.sh"
echo "  服务管理:     systemctl status shittim-chest"
echo ""
echo "  注意: 需要 Qt6 运行时 + OpenGL 支持"
echo "  如需编译: sudo apt-get install qt6-base-dev qt6-declarative-dev"
echo ""
