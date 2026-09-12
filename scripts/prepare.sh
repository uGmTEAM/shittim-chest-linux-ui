#!/bin/bash
# ============================================================
# AI OS - 环境准备脚本
# 在 Debian 上先运行此脚本，再进行正式部署
# 用法: sudo bash prepare.sh
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*"; exit 1; }

echo ""
echo "============================================================"
echo "  AI OS - 环境准备"
echo "============================================================"
echo ""

if [ "$EUID" -ne 0 ]; then
    err "请使用 sudo 运行"
fi

echo "[1/3] 更新系统..."
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl git sudo apt-transport-https ca-certificates gnupg
ok "系统更新完成"

echo "[2/3] 安装 Node.js (系统版本可能过旧，使用 NodeSource)..."
if node --version 2>/dev/null | grep -q "v18\|v20\|v21\|v22\|v23\|v24"; then
    ok "Node.js 版本足够: $(node --version)"
else
    info "当前 Node.js 版本: $(node --version 2>/dev/null || echo '未安装')"
    info "安装 Node.js 22 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
    ok "Node.js 安装完成: $(node --version)"
fi
ok "npm: $(npm --version)"

echo "[3/3] 配置 locale..."
echo "zh_CN.UTF-8 UTF-8" >> /etc/locale.gen 2>/dev/null || true
locale-gen zh_CN.UTF-8 en_US.UTF-8 2>/dev/null || true
cat > /etc/default/locale << 'EOF'
LANG=zh_CN.UTF-8
LANGUAGE=zh_CN:en
LC_ALL=zh_CN.UTF-8
EOF
ok "Locale 配置完成"

echo ""
echo "============================================================"
echo "  环境准备完成!"
echo "============================================================"
echo ""
echo "  下一步: 复制 deploy.sh 到 /tmp 并运行:"
echo "    sudo cp /path/to/deploy.sh /tmp/"
echo "    sudo bash /tmp/deploy.sh"
echo ""
