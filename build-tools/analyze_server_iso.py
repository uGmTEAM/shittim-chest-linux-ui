import os, re

ISO = r"C:\Users\Administrator\Downloads\ubuntu-24.04.4-server-amd64.iso"
OUT = r"C:\tmp\ubuntu-build"
os.makedirs(OUT, exist_ok=True)

def read_chunk(offset, size):
    with open(ISO, "rb") as f:
        f.seek(offset)
        return f.read(size)

size_gb = os.path.getsize(ISO) / (1024**3)
print(f"ISO size: {size_gb:.2f} GB")

data = read_chunk(0, 200*1024*1024)
text = data.decode("utf-8", errors="ignore")

# 找一级目录
paths = set()
for m in re.finditer(r"/([a-zA-Z0-9_\-\.]+)/?", text):
    p = m.group(1)
    if p and len(p) > 1:
        paths.add(p)

print("\n=== Top-level directories ===")
for p in sorted(paths)[:30]:
    print(f"  /{p}/")

# 找 grub.cfg
print("\n=== Searching for grub.cfg ===")
found_grub = False
for offset in [3500000, 3700000, 4000000, 5000000, 10000000, 20000000]:
    chunk = read_chunk(offset, 20000)
    t = chunk.decode("utf-8", errors="ignore")
    if "menuentry" in t:
        idx = t.find("menuentry")
        start = offset + max(0, idx - 2000)
        grub = read_chunk(start, 8000)
        lines = []
        in_b = False
        for line in grub.decode("utf-8", errors="ignore").split("\n"):
            c = line.encode("utf-8", errors="ignore").decode("ascii", errors="ignore").strip()
            if not c:
                if in_b and len(lines) > 3:
                    break
                continue
            if any(k in c for k in ["menuentry","linux ","initrd","gfxpayload","source ","set ","if [","fi","else","loadfont","timeout"]):
                in_b = True
            if in_b:
                lines.append(c)
        with open(os.path.join(OUT, "grub.cfg"), "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print(f"Found at offset {start}: {len(lines)} lines")
        for l in lines[:20]:
            print(f"  {l}")
        found_grub = True
        break

if not found_grub:
    print("Not found in expected offsets, scanning all...")
    for offset in range(0, min(100*1024*1024, len(data)), 5*1024*1024):
        chunk = read_chunk(offset, 5*1024*1024)
        t = chunk.decode("utf-8", errors="ignore")
        if "menuentry" in t:
            idx = t.find("menuentry")
            abs_offset = offset + idx
            print(f"Found at absolute offset {abs_offset}")
            start = max(0, abs_offset - 2000)
            grub = read_chunk(start, 8000)
            lines = []
            for line in grub.decode("utf-8", errors="ignore").split("\n"):
                c = line.encode("utf-8", errors="ignore").decode("ascii", errors="ignore").strip()
                if c and len(c) > 1:
                    lines.append(c)
            with open(os.path.join(OUT, "grub.cfg"), "w", encoding="utf-8") as f:
                f.write("\n".join(lines))
            print(f"Extracted {len(lines)} lines")
            for l in lines[:20]:
                print(f"  {l}")
            found_grub = True
            break

# 找 casper/
print("\n=== Casper ===")
casper_pos = text.find("/casper/")
if casper_pos >= 0:
    print(f"  /casper/ at offset {casper_pos}")
    ctx = text[casper_pos:casper_pos+300]
    for line in ctx.split("\n"):
        c = line.strip()
        if c:
            print(f"    {c[:80]}")

# 找 isolinux
print("\n=== Isolinux ===")
iso_pos = text.find("/isolinux/")
if iso_pos >= 0:
    print(f"  /isolinux/ at offset {iso_pos}")
else:
    iso2 = text.find("isolinux")
    if iso2 >= 0:
        print(f"  isolinux ref at {iso2}")

# 找 EFI
print("\n=== EFI ===")
efi_pos = text.find("/EFI/")
if efi_pos >= 0:
    print(f"  /EFI/ at offset {efi_pos}")
else:
    efi2 = text.find("bootx64.efi")
    if efi2 >= 0:
        print(f"  bootx64.efi at {efi2}")
