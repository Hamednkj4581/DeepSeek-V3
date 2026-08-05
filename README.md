# proton-register

使用已有 Outlook 邮箱辅助完成 Proton Mail 注册。项目不创建 Outlook 账号，也不包含其他网站的注册功能。

## Outlook 凭据

程序使用 Microsoft OAuth2 refresh token 换取 access token，再通过 IMAP 读取 Proton 验证邮件。需要配置：

- `EMAIL`：Outlook 邮箱地址
- `CLIENT_ID`：Microsoft OAuth 应用 client ID
- `REFRESH_TOKEN`：具备 `IMAP.AccessAsUser.All` 权限的 refresh token

本地开发时将凭据填入 `.env.development`，不要提交真实凭据。

## 运行

```bash
npm install
npm run typecheck
npm test
npm run build
node dist/app.js
```

注册流程始终开启 Proton 2FA，成功结果格式为：

```text
proton用户名----密码----otpSecret
```

GitHub Actions 的 `accounts` 输入支持多个账号，以英文分号或换行分隔；每项格式为：

```text
outlook@example.com----email_password----client_id----refresh_token
```