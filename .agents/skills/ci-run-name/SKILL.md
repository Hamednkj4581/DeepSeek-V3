---
name: ci-run-name
description: 修改或触发 GitHub Actions CI 时，用目标提交主题设置 workflow run 的显示名称，便于在 Actions 列表中识别运行。
---

# 使用提交信息命名 CI 运行

## 工作流定义

- 对仅由 `workflow_dispatch` 触发的 CI，声明必填字符串输入 `commit_message`，并在工作流顶层设置 `run-name: ${{ inputs.commit_message }}`。
- 不使用 `github.event.head_commit.message`：`workflow_dispatch` 的事件载荷不提供该字段。
- 运行名称只能使用提交主题，不得拼入 `accounts`、token、邮箱、密码或其他敏感输入。

## 触发 CI

1. 先确定 dispatch 的目标 ref 和 SHA，确保提交信息与实际运行的 `head_sha` 对应。
2. 使用 `git log -1 --format=%s <sha>` 读取单行提交主题；主题为空时停止触发并报告，不得用敏感输入或无意义文本代替。
3. 调用 workflow dispatch 时同时传入 `commit_message` 和工作流要求的其他 inputs。JSON 仍按 `github-actions-rest` skill 的安全规则在进程内生成，不把凭据写进命令或日志。

## 验证

- 校验工作流 YAML，并确认 `run-name` 只引用非敏感的 `commit_message`。
- 触发后按目标 SHA 关联运行，确认返回的 `head_sha` 是目标提交，且 `display_title` 等于该提交的单行主题。
- 重跑已有 workflow run 会沿用原运行名称；新提交必须以该提交自身的主题触发新运行。
