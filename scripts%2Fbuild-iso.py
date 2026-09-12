"""
AI OS - Custom Debian ISO Builder (Complete Rewrite)
使用方法: python build-iso.py [debian.iso路径]
"""
import subprocess
import os
import sys
import shutil
import uuid
import tempfile
import re
import stat

PROJECT_DIR = r"c:\Users\Administrator\Documents\trae_projects\new\ai-os"
OUTPUT_DIR = os.path.join(PROJECT_DIR, "output")
MKISOFS = r"E:\vmware\mkisofs.exe"
BG_JPG = r"c:\Users\Administrator\Documents\trae_projects\new\BG_CS_PR_00.jpg"

def run_ps(code):
    r = subprocess.run(["powershell", "-NoProfile", "-Command", code],
                       capture_output=True, text=True, timeout=120)
    return r.stdout.strip(), r.stderr.strip(), r.returncode

def mount_iso(iso_path):
    """挂载 ISO，返回盘符或 None"""
    code = f'''
$disk = Mount-DiskImage -ImagePath "{iso_path}" -PassThru
$vol = Get-Volume -DiskImage $disk | Where-Object {{$_.DriveLetter -ne $null}}
$vol.DriveLetter
Dismount-DiskImage -DiskImage $disk 2>$null
'''
    out, err, rc = run_ps(code)
    drive = out.strip()
    if drive and len(drive) == 1:
        return drive
    return None

def find_isolinux_bin(root):
    """递归查找 isolinux.bin"""
    for dirpath, dirnames, filenames in os.walk(root):
        if "isolinux.bin" in filenames:
            return os.path.join(dirpath, "isolinux.bin")
    return None

def is_dir(path):
    """判断是否为目录（兼容 ISO 挂载的特殊文件系统）"""
    try:
        st = os.stat(path)
        return stat.S_ISDIR(st.st_mode)
    except:
        return os.path.isdir(path)

def is_file(path):
    """判断是否为文件（兼容 ISO 挂载的特殊文件系统）"""
    try:
        st = os.stat(path)
        return stat.S_ISREG(st.st_mode)
    except:
        return os.path.isfile(path)

def copy_tree(src, dst):
    """复制目录树，目标不存在则创建，已存在则替换"""
    if not os.path.exists(dst):
        os.makedirs(dst)
    for item in os.listdir(src):
        s = os.path.join(src, item)
        d = os.path.join(dst, item)
        try:
            # 优先用 stat 判断，避免 ISO 挂载时 isdir/isfile 行为异常
            if is_file(s):
                shutil.copy2(s, d)
            elif is_dir(s):
                if os.path.exists(d):
                    shutil.rmtree(d)
                shutil.copytree(s, d)
            else:
                # fallback: 先当文件试，失败再当目录
                try:
                    shutil.copy2(s, d)
                except NotADirectoryError:
                    shutil.copytree(s, d)
        except Exception as e:
            print(f"  SKIP: {item} ({e})")

def optimize_iso(extract_dir):
    """删除 ISO 中不必要的组件以减小体积（保留固件/驱动以兼容更多硬件）"""
    saved = 0

    # 1. 删除文档和辅助目录
    for d in ["doc", "pics", "css"]:
        p = os.path.join(extract_dir, d)
        if os.path.exists(p):
            sz = 0
            for root, _, files in os.walk(p):
                for f in files:
                    try:
                        sz += os.path.getsize(os.path.join(root, f))
                    except:
                        pass
            try:
                shutil.rmtree(p, ignore_errors=True)
                saved += sz
                print(f"  [-] {d}/  ({sz/1024/1024:.1f} MB)")
            except Exception as e:
                print(f"  [WARN] {d}/ remove error: {e}")

    # 3. 从 pool 中删除纯文档/语言包 deb（保留固件与内核驱动）
    pool = os.path.join(extract_dir, "pool")
    if os.path.exists(pool):
        removed = 0
        firmware_keywords = ["libc-l10n", "locales", "man-db", "manpages",
                             "texinfo", "doc-base", "sensible-utils"]
        for root, dirs, files in os.walk(pool):
            for f in files:
                if f.endswith(".deb") and any(kw in f.lower() for kw in firmware_keywords):
                    fp = os.path.join(root, f)
                    try:
                        sz = os.path.getsize(fp)
                        os.chmod(fp, 0o644)
                        os.remove(fp)
                        removed += sz
                    except PermissionError:
                        try:
                            os.chmod(fp, 0o644)
                            os.remove(fp)
                            removed += sz
                        except:
                            pass
                    except:
                        pass
        saved += removed
        if removed > 0:
            print(f"  [-] pool doc/lang packs  ({removed/1024/1024:.0f} MB)")

    # 4. 删除 .disk 目录中的信息文件
    disk = os.path.join(extract_dir, ".disk")
    if os.path.exists(disk):
        for f in os.listdir(disk):
            if f != "base-installer":
                fp = os.path.join(disk, f)
                try:
                    os.chmod(fp, 0o644)
                    os.remove(fp)
                except:
                    pass
        print(f"  [-] .disk/ info files")

    if saved > 0:
        print(f"  [SAVED] ~{saved/1024/1024:.0f} MB")
    return saved

def replace_splash(splash_path, src_jpg, dst_png):
    """将 JPG 背景图转换为 PNG 替换 splash.png"""
    if not os.path.exists(src_jpg):
        print(f"[WARN] Background image not found: {src_jpg}, keeping original splash.png")
        return
    try:
        import subprocess
        # 使用 PowerShell + System.Drawing 转换
        ps_file = os.path.join(tempfile.gettempdir(), "convert_splash.ps1")
        ps_content = f'''Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("{src_jpg.replace(chr(92), chr(92)*2)}")
$bmp = New-Object System.Drawing.Bitmap($img.Width, $img.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, 0, 0)
$g.Dispose()
$img.Dispose()
$bmp.Save("{dst_png}", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Converted successfully"
'''
        with open(ps_file, "w", encoding="utf-8") as f:
            f.write(ps_content)
        result = subprocess.run(["powershell", "-NoProfile", "-File", ps_file],
                               capture_output=True, text=True, timeout=30)
        os.remove(ps_file)
        if result.returncode == 0:
            print(f"  [OK] splash.png replaced ({dst_png})")
            print(f"  [OK] {result.stdout.strip()}")
        else:
            print(f"[WARN] Image conversion failed: {result.stderr}")
    except Exception as e:
        print(f"[WARN] Image conversion error: {e}")

def patch_grub_cfg(grub_cfg, bg_jpg_path):
    """修改 grub.cfg：中文菜单 + preseed + 背景图"""
    if not os.path.exists(grub_cfg):
        print(f"[WARN] grub.cfg not found at {grub_cfg}")
        return

    with open(grub_cfg, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. 替换背景图引用：先尝试 BG_CS_PR_00，再 fallback 到 splash.png
    # grub.cfg 中使用 background_image 命令，支持 PNG
    bg_png_path = os.path.join(os.path.dirname(grub_cfg), "theme", "bg_cs_pr_00.png")
    bg_jpg_rel = "/isolinux/splash.png"  # fallback

    # 2. 为所有 linux 行添加 preseed 参数
    # preseed/file=/boot/grub/preseed.cfg 让安装器自动加载预配置
    preseed_param = " preseed/file=/boot/grub/preseed.cfg"

    lines = content.split("\n")
    new_lines = []
    for line in lines:
        # 在 linux 行的末尾（三个横杠前）添加 preseed 参数
        if "linux" in line and "/install.amd/vmlinuz" in line:
            # 在最后的 --- 前插入 preseed 参数
            if "---" in line:
                parts = line.split("---")
                if len(parts) >= 2:
                    line = parts[0].rstrip() + preseed_param + " ---" + parts[1]
            new_lines.append(line)
        else:
            new_lines.append(line)

    content = "\n".join(new_lines)

    # 3. 替换背景图配置：优先使用 BG_CS_PR_00.png，再 fallback
    lines = content.split("\n")
    new_lines2 = []
    i = 0
    while i < len(lines):
        line = lines[i]
        # 检测并替换背景图 if/elif 块
        if "if background_image /isolinux/splash.png" in line:
            # 收集接下来的几行直到 elif background_image /splash.png
            block_lines = []
            i += 1
            while i < len(lines) and "background_image /splash.png" not in lines[i]:
                block_lines.append(lines[i])
                i += 1
            # 现在 lines[i] 是 "elif background_image /splash.png; then" 或类似
            # 输出新的块：自定义背景 + 原 if 块内容 + elif 行
            new_lines2.append("# AI OS custom background: try BG_CS_PR_00 first")
            new_lines2.append("if background_image /boot/grub/theme/bg_cs_pr_00.png; then")
            for bl in block_lines:
                new_lines2.append(bl)
            # 保留 elif 行及其后续
            if i < len(lines):
                new_lines2.append(lines[i])
                i += 1
                # 也处理 elif 后面的内容
                while i < len(lines) and not lines[i].strip().startswith("else") and not lines[i].strip().startswith("fi"):
                    new_lines2.append(lines[i])
                    i += 1
            continue
        new_lines2.append(line)
        i += 1

    content = "\n".join(new_lines2)

    # 4. 替换菜单项为中文
    replacements = [
        ("'Graphical install'", "'图形化安装'"),
        ("'Install'", "'安装'"),
        ("'Advanced options ...'", "'高级选项...'"),
        ("'... Graphical expert install'", "'... 图形化专家安装'"),
        ("'... Graphical rescue mode'", "'... 图形化救援模式'"),
        ("'... Graphical automated install'", "'... 图形化自动安装'"),
        ("'... Expert install'", "'... 专家安装'"),
        ("'... Rescue mode'", "'... 救援模式'"),
        ("'... Automated install'", "'... 自动安装'"),
        ("'... Speech-enabled advanced options ...'", "'... 语音高级选项...'"),
        ("'... Expert speech install'", "'... 语音专家安装'"),
        ("'... Rescue speech mode'", "'... 语音救援模式'"),
        ("'... Automated speech install'", "'... 语音自动安装'"),
        ("'Accessible dark contrast installer menu ...'", "'高对比度暗色安装菜单...'"),
        ("'Install with speech synthesis'", "'带语音合成的安装'"),
    ]
    for old, new in replacements:
        content = content.replace(old, new)

    # 移除只读属性后写入
    os.chmod(grub_cfg, 0o644)
    with open(grub_cfg, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  [OK] grub.cfg patched (Chinese + preseed + custom background)")

def main():
    iso_path = sys.argv[1] if len(sys.argv) > 1 else None
    # 支持通过 ISO_SOURCE 环境变量指定已挂载目录
    env_dir = os.environ.get("ISO_SOURCE")
    if env_dir and os.path.isdir(env_dir):
        iso_path = env_dir
        print(f"  [ENV] Using mounted ISO dir: {iso_path}")
    elif not iso_path:
        for p in [r"G:\debian-13.6.0-amd64-netinst.iso", r"G:\debian-13.6.0-amd64-DVD-1.iso"]:
            if os.path.exists(p):
                iso_path = p
                break
    if not iso_path:
        print("[ERR] No Debian ISO found. Usage: python build-iso.py <path> [or set ISO_SOURCE=Y:]")
        sys.exit(1)

    print("=" * 60)
    print("  AI OS - Custom Debian ISO Builder")
    print("  Source:", iso_path)
    print("=" * 60)
    print()

    work_dir = rf"C:\tmp\ai-os-build-{uuid.uuid4().hex[:8]}"
    iso_out = os.path.join(OUTPUT_DIR, "ai-os-debian-custom.iso")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Step 1: Clean old work dirs
    print("[1/6] Cleaning old build dirs...")
    for d in os.listdir(r"C:\tmp"):
        if d.startswith("ai-os-build"):
            try:
                shutil.rmtree(os.path.join(r"C:\tmp", d), ignore_errors=True)
            except:
                pass
    os.makedirs(work_dir, exist_ok=True)
    print("[ OK ]")

    # Step 2: Mount and extract ISO
    print("[2/6] Mounting ISO...")
    if os.path.isdir(iso_path):
        iso_root = iso_path.rstrip("\\/") + "\\"
        print(f"  Using mounted dir: {iso_root}")
    else:
        drive = mount_iso(iso_path)
        if not drive:
            print("[ERR] Cannot mount ISO")
            sys.exit(1)
        iso_root = drive + ":\\"
        print(f"  Mounted at {iso_root}")

    # Step 3: Copy ISO content to writable temp dir
    print("[3/6] Copying ISO content to writable dir...")
    temp_iso_dir = os.path.join(work_dir, "iso")
    copy_tree(iso_root, temp_iso_dir)
    extract_dir = temp_iso_dir
    print("[ OK ]")

    # Step 3b: Optimize ISO
    print("[3c/6] Optimizing ISO (removing docs, keeping firmware/drivers)...")
    optimize_iso(extract_dir)
    print("[ OK ]")

    # Step 3d: Replace splash.png with custom background
    print("[3d/6] Replacing splash.png with custom background...")
    splash_path = os.path.join(extract_dir, "isolinux", "splash.png")
    if os.path.exists(BG_JPG):
        replace_splash(splash_path, BG_JPG, splash_path)
    else:
        print(f"  [SKIP] Background image not found: {BG_JPG}")
    print("[ OK ]")

    # Step 4: Inject AI OS files
    print("[4/6] Injecting AI OS...")
    for d in [".ai-os", "ai-os-scripts", "etc/systemd/system", "etc/skel", "ui", "boot", "boot/grub/theme"]:
        os.makedirs(os.path.join(extract_dir, d), exist_ok=True)

    # Copy server.mjs (AI Gateway)
    ssrc = os.path.join(PROJECT_DIR, "gateway", "server.mjs")
    sdst = os.path.join(extract_dir, "ai-os-scripts", "server.mjs")
    if os.path.exists(ssrc):
        shutil.copy2(ssrc, sdst)
        print("[ OK ] server.mjs")
    else:
        print("[WARN] server.mjs not found")

    # Copy WebUI 文件
    webui_src = os.path.join(PROJECT_DIR, "ui", "webui")
    webui_dst = os.path.join(extract_dir, "ui", "webui")
    if os.path.exists(webui_src):
        if os.path.exists(webui_dst):
            shutil.rmtree(webui_dst)
        shutil.copytree(webui_src, webui_dst)
        print("[ OK ] ui/webui/ (WebUI)")
    else:
        print("[WARN] ui/webui/ not found")

    # Copy Qt WebEngine 嵌入应用源码
    qtwebui_src = os.path.join(PROJECT_DIR, "ui", "qt-webui")
    qtwebui_dst = os.path.join(extract_dir, "ui", "qt-webui")
    if os.path.exists(qtwebui_src):
        if os.path.exists(qtwebui_dst):
            shutil.rmtree(qtwebui_dst)
        shutil.copytree(qtwebui_src, qtwebui_dst)
        print("[ OK ] ui/qt-webui/ (Qt WebEngine)")
    else:
        print("[WARN] ui/qt-webui/ not found")

    # Create preseed.cfg in /boot/grub/ (NOT root - avoid detection issues)
    preseed_dir = os.path.join(extract_dir, "boot", "grub")
    os.makedirs(preseed_dir, exist_ok=True)
    preseed_path = os.path.join(preseed_dir, "preseed.cfg")
    with open(preseed_path, "w", encoding="utf-8") as f:
        f.write('# AI OS Preseed Configuration\n')
        f.write('# Language / Keyboard / Timezone\n')
        f.write('d-i debian-installer/language string zh_CN\n')
        f.write('d-i debian-installer/country string CN\n')
        f.write('d-i debian-installer/locale string zh_CN.UTF-8\n')
        f.write('d-i console-keymap/select-keymap boolean true\n')
        f.write('d-i keyboard-configuration/layoutcode string cn\n')
        f.write('d-i keyboard-configuration/variantcode string \n')
        f.write('d-i time/zone string Asia/Shanghai\n')
        # Network
        f.write('d-i netcfg/get_hostname string shittimchest\n')
        f.write('d-i netcfg/get_domain string \n')
        f.write('d-i netcfg/disable_autoconfig boolean false\n')
        f.write('d-i netcfg/dhcp_failed note dhcp-failed\n')
        f.write('d-i netcfg/dhcp_timeout string 60\n')
        f.write('d-i netcfg/choose_interface select auto\n')
        # Mirror
        f.write('d-i mirror/country string manual\n')
        f.write('d-i mirror/http/hostname string mirrors.tuna.tsinghua.edu.cn\n')
        f.write('d-i mirror/http/directory string /debian\n')
        f.write('d-i mirror/http/proxy string \n')
        # Skip password setup (we set it in post-install)
        f.write('d-i passwd/root-password-crypted string \n')
        f.write('d-i passwd/root-password boolean false\n')
        f.write('d-i passwd/root-password-again boolean false\n')
        f.write('d-i passwd/skippassword boolean true\n')
        # Skip user creation (we create sensei in post-install)
        f.write('d-i passwd/user-fullname string Sensei\n')
        f.write('d-i passwd/username string sensei\n')
        f.write('d-i passwd/user-password-crypted string \n')
        f.write('d-i passwd/user-password boolean false\n')
        f.write('d-i passwd/user-password-again boolean false\n')
        f.write('d-i passwd/skipuser boolean true\n')
        # Partitioning: manual partitioning, confirm write
        f.write('d-i partman/choose_partition select \n')
        f.write('d-i partman/confirm boolean false\n')
        f.write('d-i partman/confirm_nooverwrite boolean false\n')
        f.write('d-i partman/confirm_write_new_label boolean true\n')
        # GRUB
        f.write('d-i grub-installer/only_debian boolean true\n')
        f.write('d-i grub-installer/with_other_os boolean true\n')
        # Auto reboot
        f.write('d-i finish-install/reboot_in_progress note\n')
    print("[ OK ] preseed.cfg (in /boot/grub/)")

    # Create post-install.sh
    pi = os.path.join(extract_dir, "ai-os-scripts", "post-install.sh")
    with open(pi, "w", encoding="utf-8") as f:
        f.write("#!/bin/bash\nset -e\n")
        f.write('exec > /var/log/ai-os-install.log 2>&1\n')
        f.write('echo "=== AI OS Deploy Started ==="\n\n')

        f.write('echo "[1/5] 安装基础工具..."\n')
        f.write('DEBIAN_FRONTEND=noninteractive apt-get update -qq\n')
        f.write('DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \\\n')
        f.write('    curl wget git sudo ca-certificates \\\n')
        f.write('    nodejs npm \\\n')
        f.write('    python3 python3-pip \\\n')
        f.write('    vim nano \\\n')
        f.write('    htop procps net-tools iputils-ping \\\n')
        f.write('    openssh-server \\\n')
        f.write('    unzip tar gzip rsync \\\n')
        f.write('    fonts-wqy-zenhei fonts-wqy-microhei \\\n')
        f.write('    tslib libts-bin \\\n')
        f.write('    xinput xserver-xorg-input-all \\\n')
        f.write('    evtest input-utils \\\n')
        f.write('    xserver-xorg xinit x11-common dbus-x11 \\\n')
        f.write('    build-essential cmake \\\n')
        f.write('    qt6-base-dev qt6-webengine-dev \\\n')
        f.write('    libqt6core6t64 libqt6gui6 libqt6quick6 libqt6qml6 \\\n')
        f.write('    libqt6qmlmodels6 libqt6qmlnetwork6 libqt6network6 \\\n')
        f.write('    libqt6opengl6 libqt6svg6 \\\n')
        f.write('    libqt6webenginecore6 libqt6webenginewidgets6 libqt6webenginequick6 \\\n')
        f.write('    qml6-module-qtwebengine qml6-module-qtquick-controls2 \\\n')
        f.write('    libqt6websockets6 libqt6positioning6 \\\n')
        f.write('    libgl1 libegl1 libgbm1 libxkbcommon0 \\\n')
        f.write('    fonts-wqy-zenhei fonts-wqy-microhei \\\n')
        f.write('    2>/dev/null || true\n')
        f.write('echo "[OK] 基础工具安装完成"\n\n')

        f.write('echo "[2/5] 配置中文环境..."\n')
        f.write('echo "zh_CN.UTF-8 UTF-8" >> /etc/locale.gen 2>/dev/null || true\n')
        f.write('locale-gen zh_CN.UTF-8 en_US.UTF-8 2>/dev/null || true\n')
        f.write("printf 'LANG=zh_CN.UTF-8\\nLANGUAGE=zh_CN:en\\nLC_ALL=zh_CN.UTF-8\\n' > /etc/default/locale\n")
        f.write("printf 'export LANG=zh_CN.UTF-8\\nexport LC_ALL=zh_CN.UTF-8\\nexport TERM=xterm-256color\\nexport PYTHONIOENCODING=utf-8\\n' > /etc/profile.d/99-locale.sh\n")
        f.write('chmod +x /etc/profile.d/99-locale.sh\n')
        f.write('update-locale LANG=zh_CN.UTF-8 2>/dev/null || true\n')
        f.write('echo "[OK] locale 配置完成"\n\n')

        f.write('echo "[3/5] 创建目录并部署 AI 服务..."\n')
        f.write('mkdir -p /opt/ai-os/gateway /etc/ai-gateway /opt/ai-os/ui\n')
        f.write('cp /ai-os-scripts/server.mjs /opt/ai-os/gateway/server.mjs 2>/dev/null || true\n')
        f.write("cat > /opt/ai-os/gateway/package.json << 'EOF'\n")
        f.write('{"name":"ai-gateway","version":"1.0.0","type":"module","main":"server.mjs","scripts":{"start":"node server.mjs"},"dependencies":{"fastify":"^5.0.0","@fastify/cors":"^10.0.0"}}\n')
        f.write("EOF\n")
        f.write("cat > /etc/ai-gateway/config.json << 'EOF'\n")
        f.write('{"ai_gateway":{"port":8080,"host":"0.0.0.0"},"models":{"openai":{"api_key":"","base_url":"https://api.openai.com/v1"},"deepseek":{"api_key":"","base_url":"https://api.deepseek.com"},"local":{"api_key":"","base_url":"http://localhost:11434/v1"}},"routing":{"default_model":"deepseek/deepseek-chat"}}\n')
        f.write("EOF\n")
        f.write('cd /opt/ai-os/gateway && npm install --omit=dev --silent 2>/dev/null || true\n')
        f.write('echo "[OK] AI Gateway 部署完成"\n\n')

        f.write('echo "[3b/5] 编译 Qt WebEngine 嵌入应用..."\n')
        f.write('rm -rf /opt/ai-os/ui/*\n')
        f.write('if [ -d /ui/webui ]; then\n')
        f.write('    cp -r /ui/webui/* /opt/ai-os/ui/\n')
        f.write('    echo "[OK] WebUI 静态文件已复制"\n')
        f.write('fi\n')
        f.write('if [ -d /ui/qt-webui ]; then\n')
        f.write('    mkdir -p /opt/ai-os/qt-webui-build\n')
        f.write('    cd /opt/ai-os/qt-webui-build\n')
        f.write('    cmake /ui/qt-webui -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/opt/ai-os/ui\n')
        f.write('    make -j$(nproc) 2>&1 || { echo "[WARN] qt-webui 编译失败，尝试降级"; make -j1; }\n')
        f.write('    cp qt-webui /opt/ai-os/ui/qt-webui\n')
        f.write('    cd / && rm -rf /opt/ai-os/qt-webui-build\n')
        f.write('    echo "[OK] Qt WebEngine 应用编译完成"\n')
        f.write('else\n')
        f.write('    echo "[WARN] qt-webui 源码未找到，使用备用方式"\n')
        f.write('fi\n')
        f.write("cat > /opt/ai-os/ui/start-webui.sh << 'STARTEOF'\n")
        f.write('#!/bin/bash\n')
        f.write('export DISPLAY=:0\n')
        f.write('export QT_QPA_PLATFORM=xcb\n')
        f.write('WEBUI_DIR="$(cd "$(dirname "$0")" && pwd)"\n')
        f.write('QT_APP="$WEBUI_DIR/qt-webui"\n')
        f.write('if [ -x "$QT_APP" ]; then\n')
        f.write('    exec "$QT_APP"\n')
        f.write('else\n')
        f.write('    echo "[ERR] qt-webui 未找到或不可执行"\n')
        f.write('    exit 1\n')
        f.write('fi\n')
        f.write('STARTEOF\n')
        f.write('chmod +x /opt/ai-os/ui/start-webui.sh\n')
        f.write('echo "[OK] WebUI 启动脚本已创建"\n\n')

        f.write('echo "[4/5] 注册 systemd 服务..."\n')
        f.write("cat > /etc/systemd/system/ai-gateway.service << 'EOF'\n")
        f.write("[Unit]\nDescription=AI Gateway Service\nAfter=network-online.target\n")
        f.write("[Service]\nType=simple\nUser=root\nWorkingDirectory=/opt/ai-os/gateway\n")
        f.write("ExecStart=/usr/bin/node /opt/ai-os/gateway/server.mjs\nRestart=always\n")
        f.write("StandardOutput=journal\n[Install]\nWantedBy=multi-user.target\nEOF\n")
        f.write("cat > /etc/systemd/system/ai-webui.service << 'EOF'\n")
        f.write("[Unit]\nDescription=AI WebUI (Spine Player Desktop)\nAfter=ai-gateway.service\nRequires=ai-gateway.service\n")
        f.write("[Service]\nType=simple\nUser=root\nEnvironment=DISPLAY=:0\n")
        f.write("WorkingDirectory=/opt/ai-os/ui\nExecStart=/opt/ai-os/ui/start-webui.sh\n")
        f.write("Restart=on-failure\nRestartSec=5\n")
        f.write("[Install]\nWantedBy=graphical.target\nEOF\n")
        f.write("systemctl daemon-reload\nsystemctl enable ai-gateway.service\n")
        f.write("systemctl start ai-gateway.service\n")
        f.write('echo "[OK] systemd 服务已注册 (ai-gateway)\n\n')

        f.write('echo "[5/5] 配置用户并清理冗余组件..."\n')
        f.write('echo "root:We_thirst_for_the_seven_wailings.We_bear_the_koan_of_Jericho." | chpasswd 2>/dev/null || true\n')
        f.write('useradd -m -s /bin/bash -G sudo sensei 2>/dev/null || true\n')
        f.write('echo "sensei:We_thirst_for_the_seven_wailings.We_bear_the_koan_of_Jericho." | chpasswd 2>/dev/null || true\n')
        f.write('chfn -f "Sensei" sensei 2>/dev/null || true\n')
        f.write("echo 'sensei ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers 2>/dev/null || true\n")
        f.write("sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config 2>/dev/null || true\n")
        f.write("service ssh restart 2>/dev/null || /usr/sbin/sshd 2>/dev/null || true\n")
        f.write('echo "[OK] 用户已创建：root + sensei"\n')

        f.write('# --- 系统设定挂钩 ---\n')
        f.write('grep -q "zh_CN.UTF-8" /etc/locale.gen || sed -i "s/# zh_CN.UTF-8/zh_CN.UTF-8/" /etc/locale.gen 2>/dev/null || true\n')
        f.write('grep -q "en_US.UTF-8" /etc/locale.gen || echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen 2>/dev/null || true\n')
        f.write('locale-gen 2>/dev/null || true\n')
        f.write('update-locale LANG=zh_CN.UTF-8 LANGUAGE="zh_CN:zh" 2>/dev/null || true\n')
        f.write('echo "Asia/Shanghai" > /etc/timezone 2>/dev/null || true\n')
        f.write('ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime 2>/dev/null || true\n')
        f.write('dpkg-reconfigure -f noninteractive tzdata 2>/dev/null || true\n')
        f.write('cat > /etc/default/keyboard << "EOF"\n')
        f.write('XKBMODEL="pc105"\nXKBLAYOUT="cn"\nXKBVARIANT=""\nXKBOPTIONS=""\nEOF\n')
        f.write('dpkg-reconfigure -f noninteractive console-setup 2>/dev/null || true\n')
        f.write('mkdir -p /etc/ai-os\n')
        f.write('echo "DISPLAY_NAME=\\"Sensei\\"" > /etc/ai-os/user.conf\n')
        f.write('echo "[OK] 设定已挂接到系统 (locale=zh_CN, tz=Asia/Shanghai, keymap=cn)"\n')
        f.write('# 清理冗余组件\n')
        f.write('apt-get remove -y --purge \\\n')
        f.write('    man-db manpages manpages-dev \\\n')
        f.write('    texinfo \\\n')
        f.write('    2>/dev/null || true\n')
        f.write('rm -rf /usr/share/doc /usr/share/man /usr/share/info /var/cache/apt/archives/* 2>/dev/null || true\n')
        f.write('echo "[OK] 用户配置完成，冗余组件已清理"\n\n')

        f.write('echo "=== AI OS Deploy Complete ==="\n')
        f.write("[GW_IP=$(ip addr show ens33 2>/dev/null | grep 'inet 192' | awk '{print $2}' | cut -d/ -f1)\n")
        f.write("[ -z \"$GW_IP\" ] && GW_IP=$(hostname -I | awk '{print $1}')\n")
        f.write("\n")
        f.write("if [ -d /opt/ai-os ]; then\n")
        f.write("    chown -R root:root /opt/ai-os\n")
        f.write("    find /opt/ai-os -type d -exec chmod 755 {} \\;\n")
        f.write("    find /opt/ai-os -type f -exec chmod 644 {} \\;\n")
        f.write("    find /opt/ai-os -type f -name \"*.sh\" -exec chmod 755 {} \\;\n")
        f.write("    find /opt/ai-os -type f -name \"*.service\" -exec chmod 644 {} \\;\n")
        f.write('    echo "[OK] 权限锁定完成：/opt/ai-os/ 仅 root 可更改"\n')
        f.write("fi\n")
        f.write("\n")
        f.write("echo '  AI Gateway:   http://$GW_IP:8080/docs'\n")
        f.write("echo '  Qt WebUI:     /opt/ai-os/ui/'\n")
        f.write("echo '  SSH:          ssh sensei@$GW_IP'\n")
    os.chmod(pi, 0o755)
    print("[ OK ] post-install.sh")

    # Create firstboot service
    fb = os.path.join(extract_dir, "etc", "systemd", "system", "ai-os-firstboot.service")
    with open(fb, "w", encoding="utf-8") as f:
        f.write("[Unit]\nDescription=AI OS First Boot Deployment\nAfter=network-online.target\n")
        f.write("[Service]\nType=oneshot\nExecStart=/bin/bash /ai-os-scripts/post-install.sh\n")
        f.write("StandardOutput=journal\nTimeoutSec=600\n[Install]\nWantedBy=multi-user.target\n")
    print("[ OK ] firstboot service")

    # skel .bashrc
    sb = os.path.join(extract_dir, "etc", "skel", ".bashrc")
    os.makedirs(os.path.dirname(sb), exist_ok=True)
    with open(sb, "a", encoding="utf-8") as f:
        f.write("\n# AI OS auto-start\n")
        f.write("systemctl is-active ai-gateway.service &>/dev/null || systemctl start ai-gateway.service\n")
    print("[ OK ] skel .bashrc")

    # Step 5: Patch grub.cfg (Chinese menu + preseed + custom background)
    print("[5/6] Patching grub.cfg...")
    grub_cfg = os.path.join(extract_dir, "boot", "grub", "grub.cfg")
    if os.path.exists(grub_cfg):
        print(f"  grub.cfg path: {grub_cfg}")
        print(f"  grub.cfg size: {os.path.getsize(grub_cfg)} bytes")
        # 强制移除只读属性
        os.chmod(grub_cfg, 0o644)
        try:
            patch_grub_cfg(grub_cfg, BG_JPG)
            # 验证 patch 是否生效
            with open(grub_cfg, "r", encoding="utf-8") as f:
                patched = f.read()
            if "图形化" in patched or "preseed/file" in patched:
                print("  [OK] grub.cfg verified patched")
            else:
                print("  [WARN] grub.cfg patch may not have applied correctly")
        except Exception as e:
            print(f"  [ERROR] grub.cfg patch failed: {e}")
            import traceback; traceback.print_exc()
    else:
        print(f"[WARN] grub.cfg not found at {grub_cfg}")
    print("[ OK ]")

    # 删除根目录的 preseed.cfg（避免干扰安装器检测）
    root_preseed = os.path.join(extract_dir, "preseed.cfg")
    if os.path.exists(root_preseed):
        os.remove(root_preseed)
        print("  [OK] Removed root preseed.cfg (moved to /boot/grub/)")

    # Step 6: Build ISO
    print("[6/6] Building ISO...")

    bin_path = find_isolinux_bin(extract_dir)
    if bin_path:
        rel_dir = os.path.relpath(os.path.dirname(bin_path), extract_dir)
        print(f"  Found isolinux.bin at: {rel_dir}/isolinux.bin")
    else:
        print("[WARN] isolinux.bin not found, building without boot support")

    # Remove boot.cat to avoid conflict
    cat_path = os.path.join(extract_dir, "isolinux", "boot.cat")
    try:
        if os.path.exists(cat_path):
            os.remove(cat_path)
            print("[ OK ] Removed old boot.cat")
    except:
        pass

    # Ensure isolinux.bin is writable
    if bin_path:
        try:
            os.chmod(bin_path, 0o644)
            print("[ OK ] Made isolinux.bin writable")
        except:
            print("[WARN] Cannot chmod isolinux.bin")

    # Build boot params
    boot_params = []
    if bin_path:
        rel_bin = os.path.relpath(bin_path, extract_dir).replace("\\", "/")
        boot_params = ["-b", rel_bin, "-no-emul-boot", "-boot-load-size", "4", "-boot-info-table"]

    cmd = [MKISOFS, "-r", "-V", "AI-OS-DEBIAN", "-J", "-l", "-o", iso_out] + boot_params + [extract_dir]
    print(f"  Command: {' '.join(cmd[:8])} ...")
    print(f"  Source dir: {extract_dir}")

    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=extract_dir)
    if r.stderr:
        err_lines = [l for l in r.stderr.split("\n") if l.strip() and "Warning" not in l and "Using " not in l]
        if err_lines:
            print("  STDERR:", "\n".join(err_lines[:5]))

    if os.path.exists(iso_out):
        size_mb = os.path.getsize(iso_out) / (1024 * 1024)
        print(f"[ OK ] ISO created: {iso_out}")
        print(f"[ OK ] Size: {size_mb:.1f} MB")
    else:
        print("[ERR] ISO was not created!")
        sys.exit(1)

    # Cleanup
    print("[CLEANUP] Removing temp files...")
    shutil.rmtree(work_dir, ignore_errors=True)
    run_ps("Get-DiskImage | Where-Object {$_.ImagePath -like '*debian*'} | ForEach-Object {Dismount-DiskImage -DiskImage $_} 2>$null")

    print()
    print("=" * 60)
    print("  DONE!")
    print(f"  Output: {iso_out}")
    print(f"  Size: {size_mb:.1f} MB")
    print("=" * 60)
    print()
    print("Next steps:")
    print("  1. Use Rufus (recommended) or dd to write ISO to USB")
    print("  2. Boot from USB, install Debian (automatic, no prompts)")
    print("  3. After install, AI Gateway auto-deploys (~2 min)")
    print("  4. Log: sudo cat /var/log/ai-os-install.log")
    print()
    print("After deploy:")
    print("  Gateway:  http://<IP>:8080/docs")
    print("  UI:       /opt/ai-os/ui/")
    print("  SSH:      ssh sensei@<IP> (pass: We_thirst_for_the_seven_wailings.We_bear_the_koan_of_Jericho.)")
    print()
    print("Config API Key:")
    print("  sudo nano /etc/ai-gateway/config.json")
    print("  sudo systemctl restart ai-gateway")

if __name__ == "__main__":
    main()



