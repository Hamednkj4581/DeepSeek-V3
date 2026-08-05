---
name: ci-run-name
description: 本仓库每次推送提交后，显式触发唯一的手动 CI `.github/workflows/ci.yml`，用提交主题命名运行并验证结果。
---

# 触发并命名唯一 CI

## 固定约束

- 本仓库只有 `.github/workflows/ci.yml` 一个 CI 工作流，且只由 `workflow_dispatch` 手动触发；推送提交不会自动创建运行。
- `ci.yml` 必须声明必填字符串输入 `commit_message`，并在工作流顶层设置 `run-name: ${{ inputs.commit_message }}`。
- 不使用 `github.event.head_commit.message`：`workflow_dispatch` 的事件载荷不提供该字段。
- 运行名称只能使用提交主题，不得拼入 `accounts`、token、邮箱、密码或其他敏感输入。

## 提交后的强制闭环

1. 每次新提交成功推送后，必须显式 dispatch 唯一的 `ci.yml`；不能等待不存在的自动触发，不能停在推送成功，也不能用其他 SHA 的已有运行代替。
2. 记录当前分支、推送后的 SHA 和 UTC 触发时间，并确认远端分支已指向该 SHA。
3. 使用 `git log -1 --format=%s <sha>` 读取单行提交主题；主题为空时停止并报告，不得用敏感输入或无意义文本代替。
4. 从 `测试数据.txt` 第二行读取 `accounts`，只在进程内构造 dispatch inputs；同时传入 `commit_message`。PAT 与 inputs 的处理分别遵守 `maintain-github-pat` 和 `github-actions-rest` skill，不得回显或落盘。
5. 调用 workflow dispatch 后按触发时间、分支和目标 SHA 轮询。收到 `204` 只表示请求成功，不表示闭环完成；必须找到本次新建的唯一 run ID。
6. 等待运行完成并逐个检查 jobs。只有目标运行已完成，或凭据、权限、服务状态等外部条件明确阻塞时才能结束任务；阻塞时必须报告尚未触发或尚未完成，不能声称交付完成。

## 验证

- 校验工作流 YAML，并确认 `run-name` 只引用非敏感的 `commit_message`。
- 触发后确认运行的 `event == workflow_dispatch`、`head_sha` 是目标提交，且 `display_title` 等于该提交的单行主题。
- 最终报告 run ID、网页 URL、运行状态和目标 jobs 结论；没有匹配运行时任务未完成。
- 重跑已有 workflow run 会沿用原运行名称；新提交必须以该提交自身的主题触发新运行。
