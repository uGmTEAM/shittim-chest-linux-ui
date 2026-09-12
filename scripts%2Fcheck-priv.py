import paramiko, sys, time

VM_IP = "192.168.247.149"
BOT_PW = "undermountain0"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(VM_IP, username='bot', password=BOT_PW, timeout=10)
print('[OK] Connected as bot')

# Check SSH config for root login
stdin, stdout, stderr = ssh.exec_command('grep -E "PermitRootLogin|PasswordAuthentication" /etc/ssh/sshd_config 2>/dev/null; echo DONE')
out = stdout.read().decode().strip()
print(f'SSH config: {out}')

# Try to use su to get root - need root password
# Check if we can use bot's password as root password (common in minimal installs)
stdin, stdout, stderr = ssh.exec_command(f"echo '{BOT_PW}' | su -c 'whoami' root 2>&1; echo EXIT:$?")
out = stdout.read().decode().strip()
print(f'su with bot password: {out}')

ssh.close()
print('DONE')
