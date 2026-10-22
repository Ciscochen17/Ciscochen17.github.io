# 一次性连接 GitHub 登录与日记发布

网站继续由 GitHub Pages 提供。Supabase 托管登录、登录状态续期和发布函数，不需要购买或维护自己的服务器。完成这些步骤后，日记页面可直接发布，不再依赖本机草稿或个人访问令牌输入。

## 1. 创建 Supabase 项目

打开 https://supabase.com/dashboard ，注册/登录后创建一个项目。数据库密码由你自行设置保管，不要提交到仓库或聊天。

项目就绪后，记下：

- Project URL：`https://你的项目编号.supabase.co`
- Publishable key（`sb_publishable_...`），也可使用旧版 anon key。

这两项可用于公开前端配置。Secret key、service_role key、数据库密码和 GitHub Client Secret 都不能写入前端或发到聊天。

如果在 Codex 中连接 Supabase 插件，可以让 Codex 执行数据库迁移、部署发布函数并填写公开配置。注册账号、创建登录应用和填写秘密值仍由你在官方页面完成。

## 2. 创建 GitHub OAuth App

打开 https://github.com/settings/applications/new ，填写：

| 字段 | 值 |
| --- | --- |
| Application name | 喵个喵个人小站 |
| Homepage URL | `https://miaogemiao.xin` |
| Authorization callback URL | `https://你的项目编号.supabase.co/auth/v1/callback` |
| Enable Device Flow | 不勾选 |

注册后取得 Client ID，自己生成 Client Secret，并在下一步直接填入 Supabase。不要把 Client Secret 写入代码。

此实现使用 GitHub OAuth App 的 `public_repo` scope 来发布公开仓库。GitHub 授权页会展示公开仓库访问权限；它不能像细粒度 PAT 一样限定到单个仓库。网站的服务端代码另外固定只允许站主账号 ID `80182649`、仓库 `Ciscochen17/Ciscochen17.github.io`、文件 `data/diary.json`。不申请 private repo、workflow、gist、组织管理等额外权限。

## 3. 在 Supabase 启用 GitHub 登录

进入 Authentication → Sign In / Providers → GitHub，启用并填写刚才的 Client ID、Client Secret，保存。

在 Authentication → URL Configuration 设置：

- Site URL：`https://miaogemiao.xin`
- Redirect URLs：`https://miaogemiao.xin/admin/`

本地调试时才额外加入 `http://127.0.0.1:4173/admin/`。PKCE 登录发起与回调必须使用同一个浏览器和站点地址，不要在中途切换域名。

项目要允许第一次 GitHub 登录创建用户。即使其他 GitHub 账号注册成功，发布函数也会按可信身份拒绝非站主账号；前端隐藏按钮并不是权限控制。

## 4. 初始化服务端凭据表

在 Supabase SQL Editor 执行仓库中的：

`supabase/migrations/202610220001_github_connections.sql`

该表只允许服务端的 service_role 读取和写入。RLS 开启，不为访客或登录用户创建访问策略；浏览器无法直接读取 GitHub 凭据。

## 5. 部署 Edge Function

函数名必须是 `github-publish`。可以通过 Supabase 插件部署，或在 Dashboard → Edge Functions → Deploy a new function → Via Editor 中添加以下两个文件：

- `supabase/functions/github-publish/index.ts`
- `supabase/functions/github-publish/handler.mjs`

函数使用 Supabase 自动提供的 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 环境变量。这些值仅留在托管运行环境中，无需填入前端。

函数的旧版网关 JWT 验证设为关闭（配置中的 `verify_jwt = false`）。函数自身会在每一次业务请求中访问 Supabase Auth 验证 Bearer JWT，并核验 GitHub 身份，任何未登录请求都会被拒绝。这样同时兼容新 Publishable key 和非旧版 JWT 签名方式。

使用 CLI 时：

```sh
supabase login
supabase link --project-ref 你的项目编号
supabase db push
supabase functions deploy github-publish --no-verify-jwt
```

默认只接受 `https://miaogemiao.xin` 的发布请求。本地调试时在函数 Secrets 中设置 `ALLOWED_ORIGINS` 为 `https://miaogemiao.xin,http://127.0.0.1:4173`；结束调试后移除本地地址。

## 6. 填写公开前端配置

执行：

```sh
python3 tools/configure_auth.py 'https://你的项目编号.supabase.co' '你的Publishable-key'
```

该命令只接受 Publishable key 或 anon key，拒绝 service_role/secret key，并自动更新静态页面资源版本。

或直接修改 `data/auth.json`：

```json
{
  "supabaseUrl": "https://你的项目编号.supabase.co",
  "publishableKey": "sb_publishable_你的公开key"
}
```

提交并推送后，访问 `https://miaogemiao.xin/admin/`，点击「使用 GitHub 登录」并完成 GitHub 的授权。账号必须是 Ciscochen17。

## 7. 验证

1. 管理页显示「发布权限已连接」。
2. 在日历选择日期，填写标题与正文，点击「发布日记」。
3. 页面先显示「已提交」，附 GitHub 提交链接；网站数据更新后显示「网站已更新」。
4. 用另一个未登录浏览器打开日记，应能阅读，但不能编辑/发布。
5. 同日内容在另一个设备被修改时，旧页面发布会提示冲突，不会静默覆盖。

GitHub Pages 更新可能需要数分钟，官方说明最长可达约 10 分钟。页面不会把仅仅提交成功说成已经全站生效。

## 凭据与会话

- 浏览器仅保留 Supabase 会话，用于自动续期登录，不持久化 GitHub provider token。
- GitHub token 在首次 OAuth 回调时传给已认证的 Edge Function；确认账号和仓库写权限后，以 AES-GCM 加密保存。
- 加密密钥由服务端密钥派生，不写入仓库。轮换 service_role key 后，需重新登录 GitHub 以重建连接。
- 当前实现登录有效期服从 Supabase 会话设置。清除浏览器数据、退出登录或撤销授权后需重新登录，不需要手动粘贴发布令牌。
- 日记只在点击发布时写入仓库。未发布文字留在当前页面，离开前应发布或导出 Markdown。
- 旧版本机草稿不会自动公开或删除；管理页可导出保留。

参考：[Supabase GitHub 登录](https://supabase.com/docs/guides/auth/social-login/auth-github)、[PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)、[Edge Functions](https://supabase.com/docs/guides/functions/quickstart-dashboard)、[GitHub Contents API](https://docs.github.com/en/rest/repos/contents)。
