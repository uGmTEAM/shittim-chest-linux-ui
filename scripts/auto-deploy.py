import paramiko, sys, time, os

VM_IP = "192.168.247.149"
VM_USER = "bot"
VM_PASSWORD = "undermountain0"
SCRIPT_PATH = os.path.join(os.path.dirname(__file__), "deploy.sh")

print("[1/4] 连接 VM...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(VM_IP, username=VM_USER, password=VM_PASSWORD, timeout=10)
print("[OK] 连接成功")

print("[2/4] 上传部署脚本...")
sftp = ssh.open_sftp()
sftp.put(SCRIPT_PATH, "/tmp/deploy.sh")
sftp.chmod("/tmp/deploy.sh", 0o755)
sftp.close()
print("[OK] 脚本已上传")

print("[3/4] 安装 sudo 并执行部署...")
# Install sudo first, then deploy, all in one session
command = f"""
apt-get update -qq && apt-get install -y sudo >/dev/null 2>&1
echo '{VM_PASSWORD}' | sudo -S bash /tmp/deploy.sh
"""
stdin, stdout, stderr = ssh.exec_command(command, timeout=420)
start = time.time()
last_output = time.time()
while True:
    if stdout.channel.exit_status_ready():
        break
    line = stdout.readline()
    if line:
        if isinstance(line, bytes): line = line.decode("utf-8", errors="replace")
        sys.stdout.write(line); sys.stdout.flush()
        last_output = time.time()
    elif time.time() - last_output > 60:
        print("[等待中] apt 安装中，请稍候..."); sys.stdout.flush(); last_output = time.time()
    elif time.time() - start > 420:
        print("[超时]"); break
    time.sleep(0.3)

exit_code = stdout.channel.recv_exit_status()
remaining = stdout.read()
if remaining:
    if isinstance(remaining, bytes): remaining = remaining.decode("utf-8", errors="replace")
    sys.stdout.write(remaining)
err_out = stderr.read()
if err_out:
    if isinstance(err_out, bytes): err_out = err_out.decode("utf-8", errors="replace")
    print(f"[STDERR] {err_out[:500]}")
print(f"\n[退出码: {exit_code}]")

print("[4/4] 验证服务...")
stdin, stdout, _ = ssh.exec_command("curl -s http://localhost:8080/health")
print(f"  Gateway: {stdout.read().decode().strip()}")
stdin, stdout, _ = ssh.exec_command("curl -s http://localhost:8082 -o /dev/null -w '%{{http_code}}'")
print(f"  Desktop: HTTP {stdout.read().decode().strip()}")
stdin, stdout, _ = ssh.exec_command("ip addr show ens33 | grep 'inet 192' | awk '{{print $2}}' | cut -d/ -f1")
ip = stdout.read().decode().strip()
print(f"  IP: {ip}")

ssh.close()
print("\n部署完成！")
print(f"\n访问地址:")
print(f"  AI Gateway:  http://{ip}:8080/docs")
print(f"  AI Desktop:  http://{ip}:8082")
print(f"\n下一步:")
print(f"  ssh {VM_USER}@{ip}  (密码: {VM_PASSWORD})")
print(f"  sudo nano /etc/ai-gateway/config.json   # 填入 DeepSeek API Key")
print(f"  sudo systemctl restart ai-gateway")
