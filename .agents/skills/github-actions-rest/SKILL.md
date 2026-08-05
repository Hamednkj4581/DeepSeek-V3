---
name: github-actions-rest
description: 在未安装或不适合使用 gh CLI 时，通过 GitHub REST API 安全地查询、触发、轮询 Actions，并检查 jobs、下载日志和 artifacts。
---

# 使用 GitHub Actions REST API

## 前置与安全

- 涉及 PAT 时同时遵守 `maintain-github-pat` skill；token 只从规定来源读入进程内变量，不写入命令文本、URL、文件、日志或 Git 配置。
- 调用前检查 `git remote -v`。如果 URL 内含用户名、PAT 或其他凭据，立即改为 `https://github.com/OWNER/REPO.git`，不得回显原 URL。
- 从无凭据的 remote 推导 `OWNER/REPO`，并用 `git rev-parse HEAD` 取得目标提交；不得硬编码其他仓库。
- 请求统一发送：`Accept: application/vnd.github+json`、`Authorization: Bearer $token`、`X-GitHub-Api-Version: 2022-11-28` 和明确的 `User-Agent`。
- 不输出请求 headers 或敏感 dispatch inputs。HTTP `401` 表示 token 无效，`403` 可能是权限不足或速率限制；报告结论后停止，不尝试绕过。
- Fine-grained PAT 至少需要仓库 `Actions: read` 才能查询和下载，触发 workflow dispatch 需要 `Actions: write`；classic PAT 访问私有仓库通常需要 `repo` scope。

## PowerShell 请求约定

在 Windows 环境优先使用 PowerShell `Invoke-RestMethod` / `Invoke-WebRequest`。仅在脚本进程内组装 headers：

```powershell
$headers = @{
    Accept = 'application/vnd.github+json'
    Authorization = "Bearer $token"
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent' = 'repository-maintenance-agent'
}
```

不得把 `$token` 展开后拼进将被记录的命令参数。JSON body 使用 `ConvertTo-Json -Compress` 在内存中生成。

## 查询现有运行

1. 读取当前分支和 `HEAD`，对工作流文件名进行 URL 编码。
2. 查询：
   `GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs?branch={branch}&per_page=100`
3. 按 `head_sha`、`event`、`created_at` 在响应中筛选目标运行；不要仅按列表第一项判断。
4. 对分页结果遵循响应 `Link` header；任务明确只看最新运行时可限制页数，但必须确保目标 SHA 已找到。
5. 需要单个运行详情时使用：
   `GET /repos/{owner}/{repo}/actions/runs/{run_id}`。

## 触发并关联 workflow_dispatch

1. 触发前记录 UTC 时间、目标 ref 和该 ref 的 `HEAD` SHA，并先确认没有会混淆关联的并发 dispatch。
2. 调用：
   `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches`
3. body 格式为 `{"ref":"main","inputs":{...}}`；成功状态为 `204 No Content`，该响应不返回 run ID。
4. 从触发时间开始轮询 workflow runs endpoint，筛选：
   - `event == workflow_dispatch`
   - `head_branch == ref`
   - `head_sha ==` 触发时记录的 SHA
   - `created_at` 不早于触发时间（允许数秒服务端时间误差）
5. 如同一 SHA 存在多个候选，再结合 `actor.login`、`run_attempt` 和最接近触发时间的 `created_at`；仍不能唯一关联时停止并报告，不得猜测 run ID。

## 等待完成与检查 jobs

1. 每 5 至 10 秒查询运行详情，直到 `status == completed`；设置与工作流上限匹配的本地 deadline，禁止无限轮询。
2. 超过 deadline 时报告超时；仅在用户要求时调用取消接口，不擅自取消运行。
3. 获取全部 jobs：
   `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs?filter=latest&per_page=100`
4. 遍历分页结果，记录每个 job 的 `name`、`status`、`conclusion`，失败时检查 `steps` 中首个非成功步骤。
5. 不能只依据 workflow run 顶层 `conclusion`；`continue-on-error`、矩阵任务和汇总任务可能掩盖目标 job 失败。

## 下载日志与 artifacts

- 只在排障需要时下载，并写入仓库外的临时目录；不得放入工作区、暂存区或提交。
- 整体日志：
  `GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs`
- 单 job 日志：
  `GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs`
- 列出 artifacts：
  `GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts?per_page=100`
- 下载 artifact：
  `GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}`，其中 `archive_format` 使用 `zip`。
- 下载 endpoint 返回重定向到短期有效的签名 URL；客户端应跟随重定向。签名 URL 也不得输出或保存到日志。
- 下载前检查 artifact 的 `expired`；下载后按 ZIP 解压，依据 artifact `name` 选择目标文件，禁止把账号结果、token、验证码或 OTP 内容回显到对话。

## 完成检查

- 报告 run ID、网页 URL、各目标 job 的状态和失败步骤，但不报告敏感 inputs 或产物内容。
- 检查 API 临时文件全部位于仓库外，工作区没有新增日志、ZIP、截图或凭据。
- 任务结束前再次确认 remote URL 不含凭据。