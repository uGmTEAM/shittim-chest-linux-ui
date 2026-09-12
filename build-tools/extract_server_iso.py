import os, re

ISO = r"C:\Users\Administrator\Downloads\ubuntu-24.04.4-server-amd64.iso"
OUT = r"C:\tmp\ubuntu-build"
os.makedirs(OUT, exist_ok=True)

def read_chunk(offset, size):
    with open(ISO, "rb") as f:
        f.seek(offset)
        return f.read(size)

print(f"ISO size: {os.path.getsize(ISO)/(1024**3):.2f} GB")

# grub.cfg 在偏移 3805335，提取并清理
print("\n=== Extracting grub.cfg ===")
start = 3805000
grub_raw = read_chunk(start, 12000)

# 清理为可读文本
text = grub_raw.decode("utf-8", errors="ignore")
lines = []
for line in text.split("\n"):
    # 只保留可打印 ASCII 字符
    clean = ""
    for c in line:
        if 32 <= ord(c) <= 126 or c in "\t\n\r":
            clean += c
        else:
            clean += " "
    clean = clean.strip()
    if clean and len(clean) > 1:
        lines.append(clean)

with open(os.path.join(OUT, "grub.cfg"), "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print(f"Extracted {len(lines)} lines:")
for l in lines[:30]:
    print(f"  {l}")

# 找 isolinux.cfg
print("\n=== Searching for isolinux.cfg ===")
data = read_chunk(0, 200*1024*1024)
text_all = data.decode("utf-8", errors="ignore")
iso_pos = text_all.find("isolinux.cfg")
if iso_pos >= 0:
    print(f"isolinux.cfg at offset {iso_pos}")
    ctx = text_all[iso_pos:iso_pos+2000]
    clean_lines = []
    for line in ctx.split("\n"):
        c = "".join(ch for ch in line if 32 <= ord(ch) <= 126 or ch in "\t").strip()
        if c:
            clean_lines.append(c)
    with open(os.path.join(OUT, "isolinux.cfg"), "w", encoding="utf-8") as f:
        f.write("\n".join(clean_lines))
    print("Extracted isolinux.cfg:")
    for l in clean_lines[:20]:
        print(f"  {l}")

# 找 casper 相关文件路径
print("\n=== Casper files ===")
for pattern in ["/casper/vmlinuz", "/casper/initrd", "/casper/vmlinuz-", "/casper/initrd-"]:
    pos = text_all.find(pattern)
    if pos >= 0:
        ctx = text_all[pos:pos+200]
        clean = "".join(ch for ch in ctx if 32 <= ord(ch) <= 126 or ch == "\n")
        print(f"{pattern}:")
        for line in clean.split("\n"):
            if line.strip(): print(f"  {line.strip()[:100]}")

# 找 EFI 目录内容
print("\n=== EFI content ===")
efi_pos = text_all.find("/EFI/")
if efi_pos >= 0:
    ctx = text_all[efi_pos:efi_pos+500]
    clean = "".join(ch for ch in ctx if 32 <= ord(ch) <= 126 or ch == "\n")
    for line in clean.split("\n"):
        if line.strip(): print(f"  {line.strip()[:100]}")
