# 2026-04-12 14:15:58 Windows SSH Key Login

## 本次做了什么

- 确认这台 Windows 已安装并启动 `OpenSSH Server`，`sshd` 已设为自动启动
- 确认局域网连接信息：主机 IP 为 `192.168.1.3`，用户名可先试 `administrator`
- 检查 `sshd_config`，确认管理员账号默认读取 `C:\ProgramData\ssh\administrators_authorized_keys`
- 尝试写入用户提供的 `ssh-ed25519` 公钥，但当前终端缺少 Windows 管理员权限，未能直接完成系统级文件写入

## 为什么这么改

- 用户希望从平板上的 `Termius` 通过局域网直接连入这台 Windows
- 用户不想设置 Windows 密码，因此改走 SSH key 登录
- 先确认服务端监听、账号路径和授权文件规则，避免继续在错误的用户名或错误的公钥文件上浪费时间

## 涉及文件

- `docs/changes/2026-04-12/windows-ssh-key-login.md`
- `C:\ProgramData\ssh\sshd_config`
- 目标授权文件：`C:\ProgramData\ssh\administrators_authorized_keys`
