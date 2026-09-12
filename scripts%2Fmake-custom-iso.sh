#!/bin/bash
# ============================================================
# AI OS - 自定义 Debian ISO 制作脚本（WSL/Linux）
# 用法: sudo bash make-custom-iso.sh <debian.iso路径>
# 示例: sudo bash make-custom-iso.sh /mnt/d/Documents/Downloads/debian-13.6.0-amd64-netinst.iso
# ============================================================
set -e

DEBIAN_ISO="${1:-}"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK_DIR="/tmp/ai-os-build"
OUTPUT_DIR="${PROJECT_DIR}/output"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*"; exit 1; }

if [ "$EUID" -ne 0 ]; then
    err "请使用 sudo: sudo bash make-custom-iso.sh <debian.iso>"
fi

# 自动检测 ISO
if [ -z "$DEBIAN_ISO" ]; then
    DEBIAN_ISO=$(find /mnt -name "debian-*-netinst.iso" -o -name "debian-*-DVD*.iso" 2>/dev/null | head -1)
    if [ -z "$DEBIAN_ISO" ]; then
        DEBIAN_ISO=$(find /media -name "debian-*-netinst.iso" 2>/dev/null | head -1)
    fi
fi

if [ -z "$DEBIAN_ISO" ] || [ ! -f "$DEBIAN_ISO" ]; then
    err "未找到 Debian ISO，请指定路径: sudo bash make-custom-iso.sh <path>"
fi

echo ""
echo "============================================================"
echo "  AI OS - 自定义 Debian ISO 制作器"
echo "  源ISO: $DEBIAN_ISO"
echo "============================================================"
echo ""

# 检查工具
for tool in genisoimage xorriso mkisofs 7z bsdtar; do
    command -v "$tool" >/dev/null 2>&1 && ISO_TOOL="$tool" && break
done
if [ -z "$ISO_TOOL" ]; then
    warn "未找到 ISO 制作工具，尝试安装..."
    apt-get install -y genisoimage 2>/dev/null || apt-get install -y xorriso 2>/dev/null || err "无法安装 ISO 工具"
    ISO_TOOL=$(command -v genisoimage || command -v xorriso || command -v mkisofs)
fi

# 1. 准备目录
info "[1/6] 准备目录..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"/{extracted,working,.ai-os,ai-os-scripts} "$OUTPUT_DIR"
ok "目录准备完成"

# 2. 挂载 ISO
info "[2/6] 挂载 ISO..."
mount -o loop,ro "$DEBIAN_ISO" "$WORK_DIR/extracted"
ok "ISO 已挂载"

# 3. 复制内容
info "[3/6] 复制 ISO 内容..."
rsync -a --exclude=/boot/isolinux/boot.cat "$WORK_DIR/extracted/" "$WORK_DIR/working/"
ok "内容已复制"

# 4. 注入 AI OS
info "[4/6] 注入 AI OS 组件..."

# 4a. 复制源码
if [ -f "${PROJECT_DIR}/gateway/server.mjs" ]; then
    cp "${PROJECT_DIR}/gateway/server.mjs" "$WORK_DIR/working/ai-os-scripts/server.mjs"
    ok "server.mjs 已注入"
else
    warn "未找到 server.mjs"
fi

if [ -f "${PROJECT_DIR}/gui/app.mjs" ]; then
    cp "${PROJECT_DIR}/gui/app.mjs" "$WORK_DIR/working/ai-os-scripts/app.mjs"
    ok "app.mjs 已注入"
else
    warn "未找到 app.mjs"
fi

# 4b. 创建 post-install.sh
cat > "$WORK_DIR/working/ai-os-scripts/post-install.sh" << 'POSTINSTALL'
#!/bin/bash
# AI OS Post-Install Script
set -e
LOG="/var/log/ai-os-install.log"
exec > "$LOG" 2>&1
echo "=== AI OS 自动部署开始 ==="

echo "[1/7] 安装系统依赖..."
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl git sudo ca-certificates \
    nodejs npm \
    fonts-wqy-zenhei fonts-wqy-microhei \
    dbus-x11 xdg-utils htop vim-tiny \
    openssh-server procps net-tools iputils-ping 2>/dev/null || true
echo "[OK] 系统依赖安装完成"

echo "[2/7] 配置中文 locale..."
echo "zh_CN.UTF-8 UTF-8" >> /etc/locale.gen 2>/dev/null || true
locale-gen zh_CN.UTF-8 en_US.UTF-8 2>/dev/null || true
cat > /etc/default/locale << 'EOF'
LANG=zh_CN.UTF-8
LANGUAGE=zh_CN:en
LC_ALL=zh_CN.UTF-8
EOF
cat > /etc/profile.d/99-locale.sh << 'EOF'
export LANG=zh_CN.UTF-8
export LC_ALL=zh_CN.UTF-8
export TERM=xterm-256color
EOF
chmod +x /etc/profile.d/99-locale.sh
echo "[OK] Locale 配置完成"

echo "[3/7] 创建目录..."
mkdir -p /opt/ai-os/gateway /opt/ai-os/gui /etc/ai-gateway
echo "[OK] 目录创建完成"

echo "[4/7] 部署 AI Gateway..."
cp /ai-os-scripts/server.mjs /opt/ai-os/gateway/server.mjs 2>/dev/null || true
cat > /opt/ai-os/gateway/package.json << 'EOF'
{"name":"ai-gateway","version":"1.0.0","type":"module","main":"server.mjs","scripts":{"start":"node server.mjs"},"dependencies":{"fastify":"^5.0.0","@fastify/cors":"^10.0.0"}}
EOF
cat > /etc/ai-gateway/config.json << 'EOF'
{"ai_gateway":{"port":8080,"host":"0.0.0.0"},"models":{"openai":{"api_key":"","base_url":"https://api.openai.com/v1"},"deepseek":{"api_key":"","base_url":"https://api.deepseek.com"},"local":{"api_key":"","base_url":"http://localhost:11434/v1"}},"routing":{"default_model":"deepseek/deepseek-chat"}}
EOF
cd /opt/ai-os/gateway && npm install --omit=dev --silent 2>/dev/null || true
echo "[OK] AI Gateway 部署完成"

echo "[5/7] 部署 AI Desktop..."
cp /ai-os-scripts/app.mjs /opt/ai-os/gui/app.mjs 2>/dev/null || true
cat > /opt/ai-os/gui/package.json << 'EOF'
{"name":"ai-desktop","version":"1.0.0","type":"module"}
EOF
echo "[OK] AI Desktop 部署完成"

echo "[6/7] 注册 systemd 服务..."
cat > /etc/systemd/system/ai-gateway.service << 'EOF'
[Unit]
Description=AI Gateway Service
After=network-online.target
[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-os/gateway
ExecStart=/usr/bin/node /opt/ai-os/gateway/server.mjs
Restart=always
StandardOutput=journal
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/ai-desktop.service << 'EOF'
[Unit]
Description=AI Desktop Environment
After=ai-gateway.service
Requires=ai-gateway.service
[Service]
Type=simple
User=root
WorkingDirectory=/opt/ai-os/gui
ExecStart=/usr/bin/node /opt/ai-os/gui/app.mjs
Restart=always
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable ai-gateway.service ai-desktop.service
systemctl start ai-gateway.service ai-desktop.service
echo "[OK] systemd 服务已启动"

echo "[7/7] 配置用户..."
useradd -m -s /bin/bash -G sudo aiuser 2>/dev/null || true
echo "aiuser:aiuser123" | chpasswd 2>/dev/null || true
echo 'aiuser ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers 2>/dev/null || true
sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config 2>/dev/null || true
service ssh restart 2>/dev/null || /usr/sbin/sshd 2>/dev/null || true
echo "[OK] 用户配置完成"

echo ""
echo "=== AI OS 部署完成 ==="
GW_IP=$(ip addr show ens33 2>/dev/null | grep 'inet 192' | awk '{print $2}' | cut -d/ -f1)
[ -z "$GW_IP" ] && GW_IP=$(hostname -I | awk '{print $1}')
echo "  AI Gateway:  http://$GW_IP:8080/docs"
echo "  AI Desktop:  http://$GW_IP:8082"
echo "  SSH:         ssh aiuser@$GW_IP (密码: aiuser123)"
echo "  下一步: sudo nano /etc/ai-gateway/config.json"
POSTINSTALL
chmod +x "$WORK_DIR/working/ai-os-scripts/post-install.sh"
ok "post-install 脚本已创建"

# 4c. 创建 systemd firstboot service
cat > "$WORK_DIR/working/etc/systemd/system/ai-os-firstboot.service" << 'FBEOF'
[Unit]
Description=AI OS First Boot Deployment
After=network-online.target
[Service]
Type=oneshot
ExecStart=/bin/bash /ai-os-scripts/post-install.sh
StandardOutput=journal
TimeoutSec=600
[Install]
WantedBy=multi-user.target
FBEOF
ok "firstboot 服务已创建"

# 4d. 添加到 skel .bashrc
echo '' >> "$WORK_DIR/working/etc/skel/.bashrc" 2>/dev/null || true
echo '# AI OS auto-start' >> "$WORK_DIR/working/etc/skel/.bashrc" 2>/dev/null || true
echo 'systemctl is-active ai-gateway.service &>/dev/null || systemctl start ai-gateway.service' >> "$WORK_DIR/working/etc/skel/.bashrc" 2>/dev/null || true
ok ".bashrc 已配置"

# 5. 打包 ISO
info "[5/6] 打包 ISO..."
ISO_NAME="ai-os-debian-custom.iso"
ISO_PATH="${OUTPUT_DIR}/${ISO_NAME}"

if command -v genisoimage >/dev/null 2>&1; then
    genisoimage -r -V "AI-OS-DEBIAN" -cache-inodes -J -l \
        -b isolinux/isolinux.bin -c isolinux/boot.cat \
        -no-emul-boot -boot-load-size 4 -boot-info-table \
        -o "$ISO_PATH" "$WORK_DIR/working/"
elif command -v xorriso >/dev/null 2>&1; then
    xorriso -as mkisofs -r -V "AI-OS-DEBIAN" -cache-inodes -J -l \
        -b isolinux/isolinux.bin -c isolinux/boot.cat \
        -no-emul-boot -boot-load-size 4 -boot-info-table \
        -o "$ISO_PATH" "$WORK_DIR/working/"
else
    err "找不到 ISO 制作工具"
fi

if [ -f "$ISO_PATH" ]; then
    ISO_SIZE=$(du -h "$ISO_PATH" | cut -f1)
    ok "ISO 已生成: $ISO_PATH"
    ok "ISO 大小: $ISO_SIZE"
else
    err "ISO 生成失败"
fi

# 卸载
umount "$WORK_DIR/extracted" 2>/dev/null || true

# 6. 完成
echo ""
echo "============================================================"
echo "  完成!"
echo "============================================================"
echo ""
echo "  输出文件: $ISO_PATH"
echo "  文件大小: $ISO_SIZE"
echo ""
echo "  使用方法:"
echo "    1. 用 UltraISO 将此 ISO 写入 U 盘"
echo "    2. 从 U 盘启动安装 Debian"
echo "    3. 安装完成后系统自动部署 AI OS（约2分钟）"
echo "    4. 查看日志: sudo cat /var/log/ai-os-install.log"
echo ""
echo "  部署后访问:"
echo "    AI Gateway:  http://<VM_IP>:8080/docs"
echo "    AI Desktop:  http://<VM_IP>:8082"
echo "    SSH:         ssh aiuser@<VM_IP> (密码: aiuser123)"
echo ""
echo "  配置 API Key:"
echo "    sudo nano /etc/ai-gateway/config.json"
echo "    sudo systemctl restart ai-gateway"
echo ""
echo "============================================================"
