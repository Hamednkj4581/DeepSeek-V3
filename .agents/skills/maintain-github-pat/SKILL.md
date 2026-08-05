---
name: maintain-github-pat
description: 维护本仓库 GitHub PAT 的读取、校验与安全使用。在触发/查询 Actions、推送、设置 Secrets，或处理 测试数据.txt 中的 PAT 时使用。
---

# 维护 GitHub PAT

## 来源与用途

- PAT 位于 `测试数据.txt` 第一行；该文件必须保持未跟踪。
- 仅用于触发和查询 GitHub Actions、必要时推送，以及需要仓库 API 鉴权的维护操作。
- 不得输出完整 PAT、不得提交、不得写入 remote URL 持久配置、不得复制到其他文件或日志。

## 硬性禁止

- **不要主动删除用户的 PAT**，可以警告。
- 禁止清空、覆盖、改写或移除 `测试数据.txt` 第一行的 PAT，也禁止删除该文件来“清理凭据”。
- 禁止用占位符、空行或其他内容替换用户的 PAT，除非用户明确要求写入新 PAT。
- 禁止调用 GitHub API 或 `gh` 撤销/删除该 token（如 delete authorization），除非用户明确要求。

## 允许的警告

发现以下情况时只警告并停止危险操作，不自行删除或改写 PAT：

- PAT 缺失、格式异常或鉴权失败（401/403）
- PAT 权限不足，无法完成触发 Actions / 推送 / Secrets 等操作
- PAT 或含 PAT 的内容即将被提交、写入 remote、打印到日志或复制到其他文件
- `测试数据.txt` 被 git 跟踪或出现在暂存区

## 使用方式

- 需要时仅在进程内从 `测试数据.txt` 第一行读取和使用，用完即丢弃，不落盘到其他路径。
- 向用户报告时只说明“PAT 有效/无效/权限不足”等结论，不回显 token 内容。
- 用户主动提供新 PAT 并要求更新时，才可改写第一行；改前确认其余行（账号信息）不受影响。

## Windows 下安全推送

1. 推送前先用 GitHub REST API 验证 PAT，并读取目标仓库的 `permissions.push`。API 鉴权成功且 `push == true` 才继续；不要仅凭 `git push` 的 `invalid credentials` 判断 PAT 无效。
2. 保持 `origin` 为不含凭据的 HTTPS URL。禁止把 PAT 拼进 URL，也不要修改全局 credential helper。
3. 需要为非交互式 Git 提供凭据时，使用仓库外的临时 `.cmd` 作为 `GIT_ASKPASS`。脚本必须用字符串数组逐行写入；禁止在 PowerShell 单引号字符串中写 `` `r`n ``，否则换行会成为字面量并导致 Git 取不到凭据。
4. PAT 只放在当前 PowerShell 进程的环境变量中。无论推送成功或失败，都在 `finally` 中删除临时脚本和相关环境变量。

```powershell
$askPass = Join-Path ([IO.Path]::GetTempPath()) 'github-git-askpass.cmd'
$env:GITHUB_PUSH_PAT = $token
$env:GIT_ASKPASS = $askPass
$env:GIT_TERMINAL_PROMPT = '0'

@(
    '@echo off'
    'echo %~1 | findstr /I "Username" >nul'
    'if not errorlevel 1 (echo x-access-token) else (echo %GITHUB_PUSH_PAT%)'
) | Set-Content -LiteralPath $askPass -Encoding ascii

try {
    git push origin HEAD
    if ($LASTEXITCODE -ne 0) { throw 'git push 失败' }
}
finally {
    Remove-Item -LiteralPath $askPass -Force -ErrorAction SilentlyContinue
    Remove-Item Env:GITHUB_PUSH_PAT,Env:GIT_ASKPASS,Env:GIT_TERMINAL_PROMPT -ErrorAction SilentlyContinue
}
```

5. 推送后比较 `git rev-parse HEAD` 与对应远端引用，并确认 `git status --short --branch` 不再显示 `ahead`；同时检查临时脚本已删除、remote URL 不含凭据。
6. 如果 API 验证有效且有 push 权限，但 Git 仍报认证失败，先检查 AskPass 文件是否存在真实换行、是否可执行以及提示词分支是否正确；不得直接宣称 PAT 无效。修正本地凭据传递后最多重试一次，仍失败再报告 Git 认证链路异常。
