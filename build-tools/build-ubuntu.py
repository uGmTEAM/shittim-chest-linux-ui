import os, glob, subprocess, shutil, tempfile, re, sys

# ─── 配置 ───────────────────────────────────────────────────
BUILD = r"C:\tmp\ubuntu-build"
OUTPUT = r"c:\Users\Administrator\Documents\trae_projects\new\ai-os\output\ai-os-ubuntu-custom.iso"
SOURCE_ISO = r"C:\Users\Administrator\Downloads\ubuntu-24.04.4-server-amd64.iso"
AI_ROOT = r"c:\Users\Administrator\Documents\trae_projects\new\ai-os"
MKISOFS = r"E:\vmware\mkisofs.exe"
UBUNTU_DRIVE = "L:\\"  # Ubuntu Server ISO 已挂载在此
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)

def read_iso_text(iso_path, offset, size=20000):
    with open(iso_path, "rb") as f:
        f.seek(offset)
        data = f.read(size)
    lines = []
    current = []
    for b in data:
        if 32 <= b <= 126 or b in (10, 13, 9):
            current.append(chr(b))
        else:
            if current:
                line = "".join(current).strip()
                if line and len(line) > 3:
                    lines.append(line)
                current = []
    return lines

# ─── Step 1: 从已挂载的 Ubuntu ISO 复制文件到构建目录 ───────
print("[1] Copying Ubuntu Server ISO files...")
if os.path.exists(BUILD):
    def handle_remove_readonly(func, path, exc):
        import stat
        if func in (os.unlink, os.remove):
            os.chmod(path, stat.S_IWRITE)
            func(path)
        else:
            raise
    shutil.rmtree(BUILD, onexc=handle_remove_readonly)
os.makedirs(BUILD)

if not os.path.exists(UBUNTU_DRIVE):
    print(f"  [ERROR] Ubuntu drive not found: {UBUNTU_DRIVE}")
    sys.exit(1)

print(f"  Source: {UBUNTU_DRIVE}")

# Use robocopy to copy all files from the mounted ISO
exclude_dirs = ["doc", "pics", "css", ".disk", "pool", "casper"]
robocopy_args = [
    UBUNTU_DRIVE, BUILD, "/E",
    "/XD", "doc", "pics", "css", ".disk", "pool",
    "/NP", "/NFL", "/NDL", "/R:0", "/W:0", "/MT:8"
]
print("  Running robocopy (this may take a few minutes)...")
r = subprocess.run(["robocopy"] + robocopy_args, capture_output=True, text=True, timeout=600)
print(f"  robocopy exit: {r.returncode}")
print(f"  stdout: {r.stdout[:500]}")
print(f"  stderr: {r.stderr[:500]}")

# Verify key files exist
key_files = ["casper/vmlinuz", "casper/initrd", "casper/vmlinuz.efi"]
for kf in key_files:
    full = os.path.join(BUILD, kf)
    if os.path.exists(full):
        sz = os.path.getsize(full)
        print(f"  [+] {kf} ({sz//1024} KB)")
    else:
        print(f"  [!] Missing: {kf}")

# ─── Step 2: 写入自定义 grub.cfg ───────────────────────────
print("[2] Writing custom grub.cfg...")
grub_cfg_path = os.path.join(os.path.dirname(__file__), "grub-custom.cfg")
with open(grub_cfg_path, "r", encoding="utf-8") as f:
    custom_grub = f.read()
grub_path = os.path.join(BUILD, "grub.cfg")
# Backup original
if os.path.exists(grub_path):
    shutil.copy2(grub_path, grub_path + ".bak")
with open(grub_path, "w", encoding="utf-8") as f:
    f.write(custom_grub)
print(f"  [+] grub.cfg ({len(custom_grub)} chars)")

# ─── Step 3: 复制 AI OS 文件 ────────────────────────────────
print("[3] Copying AI OS files...")
for src, dst in [
    (f"{AI_ROOT}\\gateway\\server.mjs", "ai-os-scripts/server.mjs"),
    (f"{AI_ROOT}\\ui\\webui", "ui/webui"),
    (f"{AI_ROOT}\\..\\arona.txt", "ai-os-scripts/arona.txt"),
]:
    s = src.replace("/", "\\")
    d = os.path.join(BUILD, dst)
    os.makedirs(os.path.dirname(d), exist_ok=True)
    if os.path.isdir(s):
        if os.path.exists(d): shutil.rmtree(d)
        shutil.copytree(s, d, dirs_exist_ok=True)
        print(f"  [+] {dst}")
    elif os.path.isfile(s):
        shutil.copy2(s, d)
        print(f"  [+] {dst} ({os.path.getsize(d)//1024}KB)")

# ─── Step 4: 创建 autoinstall.yaml ─────────────────────────
print("[4] Creating autoinstall config...")
autoinstall = """#cloud-config
locale: zh_CN
keyboard:
  layout: cn
  variant: ''
timezone: Asia/Shanghai
hostname: shittimchest
network:
  network:
    version: 2
    ethernets:
      eth0:
        dhcp4: true
runcmd:
  - echo "root:We_thirst_for_the_seven_wailings.We_bear_the_koan_of_Jericho." | chpasswd
  - useradd -m -s /bin/bash -G sudo sensei 2>/dev/null || true
  - echo "sensei:We_thirst_for_the_seven_wailings.We_bear_the_koan_of_Jericho." | chpasswd
  - echo 'sensei ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers
  - sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
  - echo "Asia/Shanghai" > /etc/timezone
  - ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
  - dpkg-reconfigure -f noninteractive tzdata
  - mkdir -p /opt/ai-os/gateway /etc/ai-gateway /opt/ai-os/ui /etc/ai-os
  - cp -r /ai-os-scripts/* /opt/ai-os/ 2>/dev/null || true
  - cp /ui/webui/* /opt/ai-os/ui/ 2>/dev/null || true
  - cp /ai-os-scripts/arona.txt /opt/ai-os/gateway/arona.txt 2>/dev/null || true
"""
with open(os.path.join(BUILD, "autoinstall.yaml"), "w", encoding="utf-8") as f:
    f.write(autoinstall)
print("  [+] autoinstall.yaml")

# preseed.cfg（兼容）
preseed = """# AI OS Preseed Configuration
d-i debian-installer/language string zh_CN
d-i debian-installer/country string CN
d-i debian-installer/locale string zh_CN.UTF-8
d-i console-keymap/select-keymap boolean true
d-i keyboard-configuration/layoutcode string cn
d-i time/zone string Asia/Shanghai
d-i netcfg/get_hostname string shittimchest
d-i netcfg/get_domain string
d-i passwd/skippassword boolean true
d-i passwd/user-fullname string Sensei
d-i passwd/username string sensei
d-i passwd/skipuser boolean true
d-i partman/choose_partition select
d-i finish-install/reboot_in_progress note
"""
with open(os.path.join(BUILD, "preseed.cfg"), "w", encoding="utf-8") as f:
    f.write(preseed)
print("  [+] preseed.cfg")

# ─── Step 5: post-install.sh ───────────────────────────────
print("[5] Creating post-install.sh...")
pi_path = os.path.join(BUILD, "ai-os-scripts", "post-install.sh")
os.makedirs(os.path.dirname(pi_path), exist_ok=True)
src_pi = os.path.join(AI_ROOT, "scripts", "post-install.sh")
if os.path.exists(src_pi):
    shutil.copy2(src_pi, pi_path)
    print(f"  [+] post-install.sh ({os.path.getsize(pi_path)//1024}KB)")
else:
    with open(pi_path, "w") as f:
        f.write("#!/bin/bash\necho 'AI OS deploy'\n")
    os.chmod(pi_path, 0o755)
    print("  [+] post-install.sh (minimal)")

# ─── Step 6: firstboot service ─────────────────────────────
fb = """[Unit]
Description=AI OS First Boot
After=network-online.target
[Service]
Type=oneshot
ExecStart=/bin/bash /ai-os-scripts/post-install.sh
StandardOutput=journal
TimeoutSec=600
[Install]
WantedBy=multi-user.target
"""
fp = os.path.join(BUILD, "etc", "systemd", "system", "ai-os-firstboot.service")
os.makedirs(os.path.dirname(fp), exist_ok=True)
with open(fp, "w") as f:
    f.write(fb)
print("[+] firstboot service")

# skel .bashrc
br = os.path.join(BUILD, "etc", "skel", ".bashrc")
os.makedirs(os.path.dirname(br), exist_ok=True)
if os.path.exists(br):
    with open(br, "a") as f:
        f.write("\n# AI OS auto-start\nsystemctl is-active ai-gateway.service &>/dev/null || systemctl start ai-gateway.service\n")
else:
    with open(br, "w") as f:
        f.write("# AI OS auto-start\nsystemctl is-active ai-gateway.service &>/dev/null || systemctl start ai-gateway.service\n")
print("[+] skel .bashrc")

# ─── Step 7: 构建 ISO ──────────────────────────────────────
print("[6] Building ISO...")
tmp_out = r"C:\tmp\ubuntu-final.iso"
if os.path.exists(tmp_out):
    os.remove(tmp_out)

# Make all files writable so mkisofs can update boot images
import stat as _stat
for dirpath, _, filenames in os.walk(BUILD):
    for fn in filenames:
        fp = os.path.join(dirpath, fn)
        try:
            os.chmod(fp, _stat.S_IWRITE)
        except OSError:
            pass
print("  [fixed] made all files writable for mkisofs")

# Remove existing boot.catalog that conflicts with mkisofs
existing_cat = os.path.join(BUILD, "boot.catalog")
if os.path.exists(existing_cat):
    os.remove(existing_cat)
    print("  [fixed] removed existing boot.catalog to avoid Rock Ridge conflict")

# Add boot parameters for BIOS (GRUB2) and EFI
cmd = ["-r", "-V", "AI-OS-UBUNTU", "-J", "-l", "-c", "boot.catalog", "-o", tmp_out]

# BIOS boot: use GRUB2 eltorito.img
bios_boot = "boot/grub/i386-pc/eltorito.img"
cmd += ["-b", bios_boot, "-no-emul-boot", "-boot-load-size", "4", "-boot-info-table"]
print(f"  Using BIOS boot: {bios_boot}")

# EFI boot: use the EFI bootloader
cmd += ["-eltorito-alt-boot", "-b", "EFI/boot/bootx64.efi", "-no-emul-boot"]
print(f"  Using EFI boot: EFI/boot/bootx64.efi")

r = subprocess.run([MKISOFS] + cmd + [BUILD], capture_output=True, text=True, timeout=600)
print(f"  mkisofs exit: {r.returncode}")
if r.stderr:
    print(f"  stderr: {r.stderr[-500:]}")
if r.stdout:
    print(f"  stdout: {r.stdout[-200:]}")

if os.path.exists(tmp_out):
    sz = os.path.getsize(tmp_out)
    print(f"  ISO created: {sz//1048576} MB")
    data = open(tmp_out, "rb").read()
    txt = data.decode("utf-8", errors="ignore")
    checks = ["AI OS 安装", "auto=true", "BOT_TOOLS", "/api/memory/profile", "MAX_MESSAGES"]
    for chk in checks:
        status = "OK" if chk in txt else "??"
        print(f"  [{status}] {chk}")

    out_name = OUTPUT
    try:
        if os.path.exists(out_name):
            os.remove(out_name)
    except PermissionError:
        import time
        out_name = OUTPUT.replace(".iso", f"-{int(time.time())}.iso")
    shutil.copy2(tmp_out, out_name)
    sz2 = os.path.getsize(out_name)
    print(f"\n[OK] {out_name}")
    print(f"     {sz2//1048576} MB")
else:
    print(f"[FAIL] ISO not created at {tmp_out}")
    sys.exit(1)
