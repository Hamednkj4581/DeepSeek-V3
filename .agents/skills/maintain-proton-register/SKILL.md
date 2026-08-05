---
name: maintain-proton-register
description: 维护 Proton Mail 注册、Outlook OAuth2/IMAP 邮件验证及 GitHub Actions 账号矩阵，并结合本地测试和 Actions 结果排查故障。
---

# 维护 Proton 邮箱注册项目

## 必须遵守

- 仅维护 Proton Mail 注册；Outlook 只作为已有辅助邮箱，通过 OAuth2 和 IMAP 接收验证码。
- 默认直接在 `main` 修改，不自行创建分支；用户明确指定其他分支时除外。
- 保留用户的无关改动。不得提交截图、日志、构建产物或任何凭据、验证码和 OTP 密钥。
- 页面行为以当前运行的日志、URL、截图和 DOM 为准，不根据过期选择器猜测。

## 测试数据与安全

- `测试数据.txt` 第一行为 GitHub PAT，第二行为 Outlook 账号；该文件必须保持未跟踪并被 `.gitignore` 忽略。
- PAT 的读取、校验、警告与禁止删除等规则见 `maintain-github-pat` skill，本 skill 不重复定义。
- Actions 的查询、触发、轮询、逐 job 检查以及日志和 artifacts 下载见 `github-actions-rest` skill；不依赖本机安装 `gh` CLI。
- 本地仅使用 `EMAIL`、`CLIENT_ID`、`REFRESH_TOKEN`；Outlook 邮箱密码只为兼容 Actions 四字段输入，不参与登录。
- Actions 的 `accounts` 每项格式为 `email----email_password----client_id----refresh_token`，多项用英文分号或换行分隔。矩阵只传账号索引；使用字段前全部添加掩码，日志和错误不得泄露邮箱或 token。
- 测试数据仅在进程内使用，不得回显或复制到已跟踪文件。

## 修改循环

1. 检查 `git status` 和当前分支，读取 Proton 主流程、`outlookMail.ts`、`ci.yml` 及相关测试。
2. 修改前通过 GitHub REST API 检查当前分支最新提交对应的 Actions 运行；没有有效运行或运行异常时，使用 `测试数据.txt` 触发 `ci.yml` 并有限轮询到完成。
3. 检查每个 `register (N)` job 的结论，不能只看工作流顶层结论，因为注册任务使用了 `continue-on-error`。
4. 注册失败时将对应日志和 `images-N` 下载到仓库外，结合失败阶段的 URL、标题、DOM 和截图定位原因。
5. 页面、选择器或工作流问题做最小兼容修改。`invalid_grant` 或 token 过期要求重新授权，`invalid_client` 检查 client ID，IMAP 鉴权失败检查 `IMAP.AccessAsUser.All`；凭据无效或 Proton 外部风控时停止改代码，不提供绕过方案。
6. 修改后执行 `npm run typecheck`、`npm test`、`npm run build` 和 Python 输入解析测试，复查 diff，确保没有凭据或调试产物。
7. 仅提交本次修改，推送后重新触发 Actions；重复验证，直到目标 `register (N)` 成功或确认外部阻塞。

## 注册流程约束

- 启动浏览器前完成 Outlook OAuth2/IMAP 预检。
- Proton 用户名由 Outlook 地址本地部分清洗后加随机后缀生成，必须满足 Proton 用户名规则且不输出辅助邮箱凭据。
- 人机验证只使用 Proton 提供的 Email 方式；仅有 CAPTCHA 时明确失败并保留截图，不绕过验证。
- 轮询 Inbox 和 Junk，只接受 Proton 发件人或主题中的新六位验证码；恢复邮箱验证排除注册阶段已用验证码。
- 注册后必须将 Outlook 设为恢复邮箱并开启 2FA，不提供关闭开关。
- 成功结果格式为 `proton用户名----密码----otpSecret`。

## 成功标准

- `npm run typecheck`、`npm test`、`npm run build` 和账号输入 Python 测试全部通过。
- Actions 目标 `register (N)` 成功，或有证据确认是凭据、服务状态或外部风控阻塞。
- 不新增非 Proton 注册流程、硬编码凭据或敏感日志。