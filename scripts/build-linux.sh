#!/bin/bash
# ShittimChestUI - Debian 13 本地编译脚本
# 用法: sudo bash build-linux.sh
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[ OK ]${NC} $*"; }
err()  { echo -e "${RED}[ERR ]${NC} $*"; exit 1; }

if [ "$EUID" -ne 0 ]; then
    err "请使用 sudo 运行: sudo bash build-linux.sh"
fi

info "安装编译依赖..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq 2>/dev/null
apt-get install -y --no-install-recommends \
    cmake g++ make \
    libqt6core6t64 libqt6gui6 libqt6quick6 libqt6qml6 \
    libqt6qmlmodels6 libqt6qmlnetwork6 libqt6network6 \
    libqt6opengl6 libqt6svg6 \
    libgl1 libegl1 libgbm1 libxkbcommon0 \
    fonts-wqy-zenhei fonts-wqy-microhei \
    2>/dev/null
ok "依赖安装完成"

info "查找 Qt6 cmake 路径..."
QT6_CMAKE=""
for p in /usr/lib/x86_64-linux-gnu/cmake/Qt6 \
         /usr/lib/qt6/lib/cmake/Qt6 \
         /usr/share/cmake-3.xx/Modules \
         /usr/lib cmake/Qt6; do
    if [ -d "$p" ]; then
        QT6_CMAKE="$p"
        break
    fi
done

# Try to find via pkg-config
if [ -z "$QT6_CMAKE" ]; then
    QT6_CMAKE=$(pkg-config --variable=libdir Qt6Core 2>/dev/null || echo "/usr/lib/x86_64-linux-gnu")
    QT6_CMAKE="$QT6_CMAKE/cmake/Qt6"
fi

if [ ! -d "$QT6_CMAKE" ]; then
    err "未找到 Qt6 cmake 配置，请安装 qt6-base-dev"
fi
ok "Qt6 cmake: $QT6_CMAKE"

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SRC_DIR/build-linux"

info "CMake 配置..."
cmake -B "$BUILD_DIR" \
    -G "Unix Makefiles" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_PREFIX_PATH="$QT6_CMAKE" \
    -S "$SRC_DIR" 2>&1 | tail -5

if [ $? -ne 0 ]; then
    err "CMake 配置失败"
fi

info "编译中（预计 1-3 分钟）..."
cmake --build "$BUILD_DIR" -j$(nproc) 2>&1 | tail -10

if [ ! -f "$BUILD_DIR/appShittimChestUI" ]; then
    err "编译失败：未生成可执行文件"
fi

ok "编译成功！"
ok "可执行文件: $BUILD_DIR/appShittimChestUI"
ok "大小: $(du -sh "$BUILD_DIR/appShittimChestUI" | cut -f1)"

info "复制资源文件..."
mkdir -p "$BUILD_DIR/resources"
if [ -d "$SRC_DIR/resources" ]; then
    cp -r "$SRC_DIR/resources/"* "$BUILD_DIR/resources/"
    ok "资源已复制"
fi

info "创建启动脚本..."
cat > "$BUILD_DIR/start.sh" << 'EOF'
#!/bin/bash
export QT_QPA_PLATFORM=xcb
export QT_SCALE_FACTOR=1.0
exec "$(dirname "$0")/appShittimChestUI" "$@"
EOF
chmod +x "$BUILD_DIR/start.sh"
ok "启动脚本: $BUILD_DIR/start.sh"

echo ""
echo "============================================================"
echo "  构建完成!"
echo "============================================================"
echo "  可执行文件: $BUILD_DIR/appShittimChestUI"
echo "  启动方式:   $BUILD_DIR/start.sh"
echo "  安装到系统: sudo cp -r $BUILD_DIR/* /opt/ai-os/ui/"
echo "  服务启动:   systemctl start shittim-chest"
echo ""
